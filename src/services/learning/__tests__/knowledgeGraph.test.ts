import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { collectKnowledgeSources, deleteKnowledgeData, graphKey, loadKnowledgeGraph, mergeKnowledgeGraphs, parseKnowledgeExtraction, practicePrefix, saveKnowledgeGraph, type KnowledgeSource } from "../knowledgeGraph";
import { questionReviewCachePrefix } from "../questionReview";
const sources: KnowledgeSource[] = [{ id: "source-a", title: "Equal groups", kind: "lesson", text: "There are two groups. Each group contains three objects. Combining the groups gives six objects." }];
const extraction = { propositions: [{ id: "p1", statement: "There are two equal groups.", anchors: [{ sourceId: "source-a", quote: "There are two groups." }] }, { id: "p2", statement: "Each group contains three objects.", anchors: [{ sourceId: "source-a", quote: "Each group contains three objects." }] }, { id: "p3", statement: "Combining both groups gives six objects.", anchors: [{ sourceId: "source-a", quote: "Combining the groups gives six objects." }] }], arguments: [{ premiseIds: ["p1", "p2"], conclusionId: "p3" }] };
let values: Map<string, string>;
beforeEach(() => { values = new Map(); vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k), key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } }); });
afterEach(() => vi.unstubAllGlobals());
describe("source-backed knowledge", () => {
    it("anchors claims exactly and preserves a complete joint-premise argument through save/load", () => {
        const graph = parseKnowledgeExtraction(extraction, "topic", sources, 1)!;
        expect(graph.arguments[0].premiseIds).toEqual(graph.propositions.slice(0, 2).map(p => p.id));
        saveKnowledgeGraph(graph);
        expect(loadKnowledgeGraph("topic")).toEqual(graph);
        expect(loadKnowledgeGraph("another-topic")).toBeNull();
    });
    it("rejects fabricated quotes, invented sources, duplicate aliases and duplicate claims", () => {
        for (const patch of [
            { anchors: [{ sourceId: "source-a", quote: "A sentence never provided in the source." }] },
            { anchors: [{ sourceId: "invented", quote: "There are two groups." }] },
            { id: "p2" },
            { statement: extraction.propositions[1].statement },
        ])
            expect(parseKnowledgeExtraction({ ...extraction, propositions: [{ ...extraction.propositions[0], ...patch }, ...extraction.propositions.slice(1)] }, "topic", sources)).toBeNull();
    });
    it("rejects cycles, dangling references, empty premises and self dependencies", () => {
        for (const args of [
            [...extraction.arguments, { premiseIds: ["p3"], conclusionId: "p1" }],
            [{ premiseIds: ["missing"], conclusionId: "p3" }],
            [{ premiseIds: [], conclusionId: "p3" }],
            [{ premiseIds: ["p3"], conclusionId: "p3" }],
        ])
            expect(parseKnowledgeExtraction({ ...extraction, arguments: args }, "topic", sources)).toBeNull();
    });
    it("adds exact ideas without semantic merging, forgetting old ideas or dropping premises", () => {
        const old = parseKnowledgeExtraction(extraction, "topic", sources, 1)!;
        const next = parseKnowledgeExtraction({ propositions: [{ id: "p4", statement: "Each group still contains three objects.", anchors: [{ sourceId: "source-a", quote: "Each group contains three objects." }] }], arguments: [] }, "topic", sources, 2)!;
        const merged = mergeKnowledgeGraphs(old, next);
        expect(merged.propositions).toHaveLength(4);
        expect(merged.arguments).toEqual(old.arguments);
        expect(merged.arguments[0].premiseIds).toHaveLength(2);
        expect(() => mergeKnowledgeGraphs(old, { ...next, trackId: "another" })).toThrow("different topic");
        expect(() => mergeKnowledgeGraphs(old, { ...next, sources: [{ ...sources[0], text: "Changed original source" }] })).toThrow("identity changed");
    });
    it("never silently replaces an existing map if persistence fails", () => {
        const graph = parseKnowledgeExtraction(extraction, "topic", sources)!;
        saveKnowledgeGraph(graph);
        const old = values.get(graphKey("topic"));
        vi.stubGlobal("localStorage", { setItem: () => { throw new Error("Quota exceeded"); } });
        expect(() => saveKnowledgeGraph({ ...graph, updatedAt: 99 })).toThrow();
        expect(values.get(graphKey("topic"))).toBe(old);
    });
    it("deletes only the topic's map, practice, drafts and review receipts", () => {
        const checkId = "practice:run:question", mid = "practice:run:target";
        values.set(graphKey("a"), "{}");
        values.set(graphKey("ab"), "keep");
        values.set(practicePrefix("a") + "run", JSON.stringify({ trackId: "a", id: "run", rounds: [{ check: { id: checkId, milestoneId: mid } }] }));
        values.set(practicePrefix("ab") + "other", "keep");
        values.set(`learnforge:check-draft:${checkId}`, "private");
        values.set(questionReviewCachePrefix(mid) + "receipt", "private");
        values.set("learnforge:check-draft:other", "keep");
        deleteKnowledgeData("a");
        expect([...values.keys()]).toEqual([graphKey("ab"), practicePrefix("ab") + "other", "learnforge:check-draft:other"]);
    });
    it("collects bounded saved teaching/source material, not learner answers or internal messages", () => {
        const sources = collectKnowledgeSources([{ session: { id: "s", title: "Topic", topic: "", language: null, created_at: 0, updated_at: 0 }, milestones: [], messages: [{ id: "u", session_id: "s", role: "user", content: "PRIVATE LEARNER ANSWER".repeat(5), created_at: 1 }, { id: "internal", session_id: "s", role: "assistant", internal: true, content: "PRIVATE INTERNAL".repeat(5), created_at: 2 }, { id: "teach", session_id: "s", role: "assistant", content: "A useful explanation of why the first quantity changes the second quantity.", created_at: 3 }] }]);
        expect(sources).toHaveLength(1);
        expect(sources[0].id).toContain("explanation:teach:");
        expect(JSON.stringify(sources)).not.toContain("PRIVATE");
    });
});
