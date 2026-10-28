import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';

const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';

interface StoredCodexAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  email?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function extractAccountInfo(
  accessToken: string,
  idToken?: string
): { accountId?: string; email?: string; expiresAt?: number } {
  const accessPayload = decodeJwtPayload(accessToken);
  const idPayload = idToken ? decodeJwtPayload(idToken) : {};
  const authClaim = (accessPayload['https://api.openai.com/auth'] ||
    idPayload['https://api.openai.com/auth'] ||
    {}) as Record<string, unknown>;
  const profileClaim = (accessPayload['https://api.openai.com/profile'] ||
    idPayload['https://api.openai.com/profile'] ||
    {}) as Record<string, unknown>;

  const accountId =
    (typeof authClaim.chatgpt_account_id === 'string' &&
      authClaim.chatgpt_account_id) ||
    (typeof accessPayload.chatgpt_account_id === 'string' &&
      accessPayload.chatgpt_account_id) ||
    undefined;
  const email =
    (typeof idPayload.email === 'string' && idPayload.email) ||
    (typeof profileClaim.email === 'string' && profileClaim.email) ||
    undefined;
  const exp =
    typeof accessPayload.exp === 'number'
      ? accessPayload.exp * 1000
      : undefined;
  return { accountId, email, expiresAt: exp };
}

function chatgptCodexOAuthPlugin(): Plugin {
  const authFile = path.resolve(__dirname, '.lazyweb/chatgpt-codex-auth.json');
  let pendingPkce: { verifier: string; state: string } | null = null;
  let callbackServer: http.Server | null = null;

  const readStoredAuth = (): StoredCodexAuth | null => {
    try {
      if (!fs.existsSync(authFile)) return null;
      const parsed = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      if (parsed && typeof parsed.accessToken === 'string') return parsed;
    } catch {
      // ignore
    }
    return null;
  };

  const writeStoredAuth = (auth: StoredCodexAuth) => {
    fs.mkdirSync(path.dirname(authFile), { recursive: true });
    fs.writeFileSync(authFile, JSON.stringify(auth, null, 2), 'utf8');
  };

  const exchangeCodeForToken = async (code: string, verifier: string) => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CODEX_CLIENT_ID,
      code,
      redirect_uri: CODEX_REDIRECT_URI,
      code_verifier: verifier,
    });
    const res = await fetch(CODEX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    const info = extractAccountInfo(data.access_token, data.id_token);
    const stored: StoredCodexAuth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt:
        info.expiresAt ||
        (data.expires_in ? Date.now() + data.expires_in * 1000 : undefined),
      accountId: info.accountId,
      email: info.email,
    };
    writeStoredAuth(stored);
    return stored;
  };

  const ensureFreshAuth = async (): Promise<StoredCodexAuth | null> => {
    const current = readStoredAuth();
    if (!current) return null;
    if (
      current.expiresAt &&
      current.refreshToken &&
      Date.now() > current.expiresAt - 60_000
    ) {
      try {
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CODEX_CLIENT_ID,
          refresh_token: current.refreshToken,
        });
        const res = await fetch(CODEX_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            access_token: string;
            refresh_token?: string;
            id_token?: string;
            expires_in?: number;
          };
          const info = extractAccountInfo(data.access_token, data.id_token);
          const refreshed: StoredCodexAuth = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || current.refreshToken,
            expiresAt:
              info.expiresAt ||
              (data.expires_in
                ? Date.now() + data.expires_in * 1000
                : current.expiresAt),
            accountId: info.accountId || current.accountId,
            email: info.email || current.email,
          };
          writeStoredAuth(refreshed);
          return refreshed;
        }
      } catch {
        // Fall through to current token
      }
    }
    return current;
  };

  return {
    name: 'learnforge-chatgpt-codex-oauth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/chatgpt-codex/')) return next();

        const sendJson = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        const readJsonBody = (): Promise<Record<string, unknown>> =>
          new Promise((resolve) => {
            const chunks: Buffer[] = [];
            req.on('data', (c) => chunks.push(Buffer.from(c)));
            req.on('end', () => {
              try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
              } catch {
                resolve({});
              }
            });
          });

        if (req.url === '/api/chatgpt-codex/status' && req.method === 'GET') {
          const auth = readStoredAuth();
          if (!auth) return sendJson(200, { authenticated: false });
          return sendJson(200, {
            authenticated: true,
            email: auth.email,
            accountId: auth.accountId,
          });
        }

        if (req.url === '/api/chatgpt-codex/logout' && req.method === 'POST') {
          try {
            if (fs.existsSync(authFile)) fs.unlinkSync(authFile);
          } catch {}
          return sendJson(200, { authenticated: false });
        }

        if (req.url === '/api/chatgpt-codex/login' && req.method === 'POST') {
          const verifier = crypto.randomBytes(32).toString('base64url');
          const challenge = crypto
            .createHash('sha256')
            .update(verifier)
            .digest('base64url');
          const state = crypto.randomBytes(16).toString('hex');
          pendingPkce = { verifier, state };

          if (callbackServer) {
            try {
              callbackServer.close();
            } catch {}
            callbackServer = null;
          }

          try {
            callbackServer = http.createServer(async (cbReq, cbRes) => {
              try {
                const parsedUrl = new URL(
                  cbReq.url || '/',
                  'http://localhost:1455'
                );
                if (parsedUrl.pathname !== '/auth/callback') {
                  cbRes.writeHead(404);
                  cbRes.end('Not found');
                  return;
                }
                const code = parsedUrl.searchParams.get('code');
                if (!code || !pendingPkce) {
                  cbRes.writeHead(400, { 'Content-Type': 'text/html' });
                  cbRes.end(
                    '<h3>Missing authorization code. Return to LearnForge and try again.</h3>'
                  );
                  return;
                }
                await exchangeCodeForToken(code, pendingPkce.verifier);
                cbRes.writeHead(200, { 'Content-Type': 'text/html' });
                cbRes.end(
                  '<!doctype html><html><body style="background:#111315;color:#e5ebf3;font-family:monospace;display:grid;place-items:center;height:90vh"><div style="text-align:center;border:1px solid #353c46;padding:28px;border-radius:10px;background:#191b1e"><h2 style="color:#4ade80;margin:0 0 10px">Signed in to LearnForge</h2><p>Your ChatGPT / Codex subscription is now connected. You can close this window.</p><script>setTimeout(()=>window.close(),1200)</script></div></body></html>'
                );
              } catch (err) {
                cbRes.writeHead(500, { 'Content-Type': 'text/html' });
                cbRes.end(
                  `<h3>Sign-in failed: ${(err as Error).message}</h3>`
                );
              } finally {
                setTimeout(() => {
                  try {
                    callbackServer?.close();
                  } catch {}
                  callbackServer = null;
                }, 1500);
              }
            });
            callbackServer.on('error', () => {
              // Port 1455 may already be in use; user can paste callback URL manually
            });
            callbackServer.listen(1455, '127.0.0.1');
          } catch {
            // Ignore port bind error
          }

          const params = new URLSearchParams({
            response_type: 'code',
            client_id: CODEX_CLIENT_ID,
            redirect_uri: CODEX_REDIRECT_URI,
            scope: 'openid profile email offline_access',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            id_token_add_organizations: 'true',
            codex_cli_simplified_flow: 'true',
            state,
          });
          return sendJson(200, {
            authUrl: `${CODEX_AUTH_URL}?${params.toString()}`,
          });
        }

        if (
          req.url === '/api/chatgpt-codex/callback-manual' &&
          req.method === 'POST'
        ) {
          const body = await readJsonBody();
          const raw =
            typeof body.callbackUrlOrToken === 'string'
              ? body.callbackUrlOrToken.trim()
              : '';
          if (!raw) {
            return sendJson(400, {
              error: 'Paste the callback URL or OAuth access token.',
            });
          }
          try {
            if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('code=')) {
              const urlObj = new URL(
                raw.startsWith('http')
                  ? raw
                  : `http://localhost:1455/auth/callback?${raw.replace(/^\?/, '')}`
              );
              const code = urlObj.searchParams.get('code');
              if (!code || !pendingPkce) {
                return sendJson(400, {
                  error:
                    'Click "Sign in with ChatGPT" first, then paste the redirected callback URL.',
                });
              }
              const stored = await exchangeCodeForToken(
                code,
                pendingPkce.verifier
              );
              return sendJson(200, {
                authenticated: true,
                email: stored.email,
                accountId: stored.accountId,
              });
            } else {
              const info = extractAccountInfo(raw);
              const stored: StoredCodexAuth = {
                accessToken: raw,
                accountId: info.accountId,
                email: info.email,
                expiresAt: info.expiresAt,
              };
              writeStoredAuth(stored);
              return sendJson(200, {
                authenticated: true,
                email: stored.email,
                accountId: stored.accountId,
              });
            }
          } catch (err) {
            return sendJson(400, { error: (err as Error).message });
          }
        }

        const fetchLiveCodexModels = async (auth: StoredCodexAuth) => {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${auth.accessToken}`,
            originator: 'codex_cli_rs',
          };
          if (auth.accountId) headers['ChatGPT-Account-ID'] = auth.accountId;
          const res = await fetch(
            'https://chatgpt.com/backend-api/codex/models?client_version=1.0.0',
            { method: 'GET', headers }
          );
          if (!res.ok) return [];
          const data = (await res.json().catch(() => ({}))) as {
            models?: Array<{
              slug?: string;
              id?: string;
              display_name?: string;
              name?: string;
              context_window?: number;
            }>;
          };
          const list = Array.isArray(data?.models) ? data.models : [];
          return list.filter(
            (m) => (m.slug || m.id) !== 'codex-auto-review'
          );
        };

        if (
          req.url?.startsWith('/api/chatgpt-codex/v1/models') &&
          req.method === 'GET'
        ) {
          const auth = await ensureFreshAuth();
          if (!auth) return sendJson(200, { data: [] });
          try {
            const models = await fetchLiveCodexModels(auth);
            return sendJson(200, {
              data: models.map((m) => ({
                id: m.slug || m.id || '',
                name: m.display_name || m.name || m.slug || m.id || '',
                ...(typeof m.context_window === 'number'
                  ? { context_window: m.context_window }
                  : {}),
              })),
            });
          } catch {
            return sendJson(200, { data: [] });
          }
        }

        if (
          req.url === '/api/chatgpt-codex/v1/chat/completions' &&
          req.method === 'POST'
        ) {
          const auth = await ensureFreshAuth();
          if (!auth) {
            return sendJson(401, {
              error: {
                message:
                  'Not signed in to ChatGPT / Codex. Open Settings → AI Connection and click Sign in with ChatGPT.',
              },
            });
          }

          const body = await readJsonBody();
          const messages = Array.isArray(body.messages) ? body.messages : [];
          let model =
            typeof body.model === 'string' && body.model.trim()
              ? body.model.trim()
              : 'gpt-6.1-sol';
          const wantStream = Boolean(body.stream);

          const systemParts: string[] = [];
          const inputItems: Array<Record<string, unknown>> = [];

          for (const msg of messages as Array<{
            role?: string;
            content?: unknown;
          }>) {
            const textContent =
              typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                ? msg.content
                    .map((p: { text?: string }) => p?.text || '')
                    .join('\n')
                : '';
            if (msg.role === 'system') {
              if (textContent.trim()) systemParts.push(textContent.trim());
            } else if (msg.role === 'assistant') {
              inputItems.push({
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: textContent }],
              });
            } else {
              inputItems.push({
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: textContent }],
              });
            }
          }

          const buildPayload = (targetModel: string) => ({
            model: targetModel,
            instructions:
              systemParts.join('\n\n') ||
              'You are LearnForge, a Socratic tutor.',
            input:
              inputItems.length > 0
                ? inputItems
                : [
                    {
                      type: 'message',
                      role: 'user',
                      content: [{ type: 'input_text', text: 'Hello' }],
                    },
                  ],
            store: false,
            stream: true,
          });

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${auth.accessToken}`,
            originator: 'codex_cli_rs',
          };
          if (auth.accountId) {
            headers['ChatGPT-Account-ID'] = auth.accountId;
          }

          try {
            let upstream = await fetch(CODEX_RESPONSES_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify(buildPayload(model)),
            });

            if (upstream.status === 400) {
              const firstErr = await upstream.text().catch(() => '');
              if (
                firstErr.includes('not supported') ||
                firstErr.includes('model_not_found')
              ) {
                const liveModels = await fetchLiveCodexModels(auth).catch(
                  () => []
                );
                const fallbackSlug =
                  liveModels[0]?.slug ||
                  liveModels[0]?.id ||
                  (model !== 'gpt-6.1-sol' ? 'gpt-6.1-sol' : 'gpt-6-luna');
                if (fallbackSlug && fallbackSlug !== model) {
                  model = fallbackSlug;
                  upstream = await fetch(CODEX_RESPONSES_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(buildPayload(model)),
                  });
                } else {
                  return sendJson(400, {
                    error: { message: firstErr },
                  });
                }
              } else {
                return sendJson(400, {
                  error: { message: firstErr },
                });
              }
            }

            if (!upstream.ok || !upstream.body) {
              const errText = await upstream.text().catch(() => '');
              return sendJson(upstream.status || 502, {
                error: {
                  message:
                    errText || `ChatGPT Codex error (${upstream.status})`,
                },
              });
            }

            if (wantStream) {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
              });
            }

            const reader = upstream.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            let usage: { prompt_tokens: number; completion_tokens: number } | null = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const rawJson = trimmed.slice(5).trim();
                if (!rawJson || rawJson === '[DONE]') continue;
                try {
                  const evt = JSON.parse(rawJson);
                  if (evt.type === 'response.completed' && evt.response?.usage) {
                    usage = {
                      prompt_tokens: Number(evt.response.usage.input_tokens) || 0,
                      completion_tokens: Number(evt.response.usage.output_tokens) || 0,
                    };
                  }
                  if (
                    evt.type === 'response.output_text.delta' &&
                    typeof evt.delta === 'string'
                  ) {
                    fullText += evt.delta;
                    if (wantStream) {
                      const chunk = {
                        id: 'chatcmpl-codex',
                        object: 'chat.completion.chunk',
                        model,
                        choices: [
                          {
                            index: 0,
                            delta: { content: evt.delta },
                            finish_reason: null,
                          },
                        ],
                      };
                      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                  }
                } catch {
                  // ignore malformed event
                }
              }
            }

            if (wantStream) {
              if (usage) {
                res.write(
                  `data: ${JSON.stringify({ id: 'chatcmpl-codex', object: 'chat.completion.chunk', model, choices: [], usage })}\n\n`
                );
              }
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            } else {
              return sendJson(200, {
                id: 'chatcmpl-codex',
                object: 'chat.completion',
                model,
                ...(usage ? { usage } : {}),
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: fullText || 'ok' },
                    finish_reason: 'stop',
                  },
                ],
              });
            }
          } catch (err) {
            return sendJson(502, {
              error: { message: (err as Error).message },
            });
          }
        }

        return next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), chatgptCodexOAuthPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
});
