import {parseChatJson,readChatText,StructuredResponseError} from "../ai/structuredResponse";
import {hideLearningCheckBlocks} from "./checks";
import {extractVisualExample,hideCustomCanvasBlocks,validateVisualExample,visualForScientificPresentation,type VisualExample} from "./visuals";

/** Only describe renderers that this help surface actually accepts. */
export const SCIENTIFIC_HELP_INSTRUCTIONS = `FIGURE RESPONSE CONTRACT:
Return one JSON object {"explanation":"optional short introduction","visual":{...}}. No outer Markdown fence or surrounding prose. JSON-escape quotes, newlines and backslashes. Never produce HTML, CSS, JavaScript, canvas, a diagram card grid, or a fixed language-specific simulation.
Default visual: {"kind":"state-model","title":"short sentence-case title","summary":"what to notice","items":[{"id":"cause","label":"What changes","description":"Explain the cause"},{"id":"effect","label":"What follows","description":"Explain its visible effect"}],"takeaway":"one useful distinction","stateModel":{"version":1,"presentation":{"style":"scientific","layout":"lanes"},"initialStateId":"before","entities":[{"id":"participant","label":"Short subject-specific name"}],"states":[{"id":"before","label":"Before","description":"What the starting condition means","entities":[{"entityId":"participant","status":"Waiting","value":"Starting condition","tone":"waiting"}]},{"id":"after","label":"After","description":"What changed and why","entities":[{"entityId":"participant","status":"Changed","value":"A genuinely different condition","tone":"done"}]}],"transitions":[{"id":"apply","from":"before","to":"after","label":"Apply the relevant action","explanation":"Why this action changes the condition"}]}}.
Fill the model for the actual subject. Use 1–4 entities, 2–4 reachable states, and 1–4 actions. Each state must have exactly one snapshot for EVERY entity. Identifiers use letters, digits, underscores or hyphens, up to 48 characters. Snapshot status is at most 32 characters; text value at most 160; tone is neutral|active|waiting|done. Code values use format="code", language="the actual language", and value containing correctly indented source with JSON-escaped newlines, at most 2000 characters/40 lines. Do not put Markdown code fences in code values. Every action changes at least one visible value, status or relationship, not just a caption or color. Never claim this illustrative model is measured runtime behavior. Do not fabricate memory addresses or timings.
Optional relations inside a state: [{"id":"link","from":"entity-id","to":"different-entity-id","kind":"value|reference|flow","label":"short genuine relationship"}]. Only reference declared entities. Use layout="comparison" when initial/current contrast helps. The app owns geometry, colors, paper appearance and controls.
For real quantitative relationships, an owned parameter explorer is also accepted: visual.kind="explorer", explorer={"prompt":"what to vary","parameters":[{"id":"rate","label":"Subject-appropriate label","min":0,"max":2,"step":0.1,"initial":1}],"outputs":[{"id":"result","label":"Subject-appropriate result","expression":"rate * 2","precision":2}],"curve":{"xLabel":"x","yLabel":"y","xMin":-2,"xMax":2,"expression":"rate * x"}}. Use only real, explained quantities; no invented mathematics for programming or language learning. Straight-line slope alone may use kind="graph", graph={"type":"slope","points":[{"x":-2,"y":-1},{"x":2,"y":3}]} with coordinates in [-5,5] on half-unit increments. These formats still need a clear title, summary, explanation notes and takeaway.
Use actual mathematical notation only for genuinely mathematical relationships. Other subjects use plain words, accurate diacritics, or real code. Preserve the learner's subject and level. Never encode an unanswered question's answer key; illustrate a smaller analogous case instead.`;

export class VisualHelpError extends Error {
  constructor() {
    super("The tutor couldn’t build a usable figure. Try another figure or use a walkthrough.");
    this.name="VisualHelpError";
  }
}
function paperFigure(value:unknown):VisualExample|null {
  if(!value||typeof value!=="object")return null;
  const raw=value as Record<string,unknown>;
  // Appearance is host policy. Supplying the omitted paper style does not alter
  // entities, code, values, actions, relationships or the scientific-change check.
  const model=(raw.stateModel||raw) as Record<string,unknown>;
  const candidate=(raw.kind==="state-model"||raw.stateModel||Array.isArray(raw.states))&&model.presentation===undefined
    ? {...raw,stateModel:{...model,presentation:{style:"scientific",layout:"lanes"}}}:raw;
  return visualForScientificPresentation(validateVisualExample(candidate));
}
export function decodeVisualHelp(envelope:unknown):{content:string;visual:VisualExample} {
  const raw=readChatText(envelope);
  try {
    const parsed=parseChatJson(envelope,["json","forge-visual"]) as Record<string,unknown>;
    const visual=paperFigure(parsed?.visual||parsed);
    if(visual) {
      const intro=typeof parsed?.explanation==="string"?parsed.explanation:"";
      if(intro.length>60000)throw new VisualHelpError();
      return {content:hideLearningCheckBlocks(hideCustomCanvasBlocks(intro)),visual};
    }
  }catch(e){
    if(!(e instanceof StructuredResponseError)&&!(e instanceof VisualHelpError))throw e;
  }
  // Existing providers may keep the established forge-visual-in-prose protocol.
  // Extraction only closes on a standalone fence, not a fence inside source code.
  const visual=paperFigure(extractVisualExample(raw));
  if(!visual)throw new VisualHelpError();
  return {content:hideLearningCheckBlocks(hideCustomCanvasBlocks(raw)),visual};
}
