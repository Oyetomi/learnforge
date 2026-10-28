import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/languages/definitions/go/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/languages/definitions/rust/register.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';

// Bundle the editor locally so the workspace does not depend on a CDN connection.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
import 'monaco-editor/languages/definitions/cpp/register.js';
import 'monaco-editor/languages/definitions/java/register.js';
import 'monaco-editor/languages/definitions/csharp/register.js';
import 'monaco-editor/languages/definitions/shell/register.js';
import 'monaco-editor/languages/definitions/ruby/register.js';
import 'monaco-editor/languages/definitions/php/register.js';
import 'monaco-editor/languages/definitions/swift/register.js';
import 'monaco-editor/languages/definitions/sql/register.js';
import 'monaco-editor/languages/definitions/lua/register.js';
import 'monaco-editor/languages/definitions/kotlin/register.js';
import 'monaco-editor/languages/definitions/r/register.js';
