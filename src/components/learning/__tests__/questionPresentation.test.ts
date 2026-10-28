import { describe, expect, it } from "vitest";
import { formatCheckContext, questionPresentation } from "../questionPresentation";

describe("code in question headings", () => {
  it("moves long Go declarations into code context, preserving exact source and short named references", () => {
    const result = questionPresentation(
      "Given `type User struct{ name string }` with method `func (u *User) SetName(n string)`, which assignment compiles successfully?"
    );
    expect(result.stem).toBe(
      "Given `User` with method `SetName`, which assignment compiles successfully?"
    );
    expect(result.snippets).toEqual([
      "type User struct{ name string }",
      "func (u *User) SetName(n string)",
    ]);
  });
  it("keeps short expressions and fenced blocks unchanged", () => {
    const question =
      "Does `*T` implement `Writer`?\n\n```go\nfunc Work() {}\n```";
    expect(questionPresentation(question)).toEqual({
      stem: question,
      snippets: [],
    });
  });
  it("does not promote escaped or nested backticks as declarations", () => {
    const question = "Read ``type User struct{ name string }`` literally.";
    expect(questionPresentation(question).snippets).toEqual([]);
  });

  describe("formatCheckContext", () => {
    it("wraps raw unfenced code with language-tagged markdown code block and restores newlines", () => {
      const rawCode =
        'mux := http.NewServeMux() mux.HandleFunc("GET /posts/{$}", postsListHandler)\nmux.HandleFunc("GET /posts/{id}", postDetailHandler)';
      const formatted = formatCheckContext(rawCode, "go");
      expect(formatted).toBe(
        '```go\nmux := http.NewServeMux()\nmux.HandleFunc("GET /posts/{$}", postsListHandler)\nmux.HandleFunc("GET /posts/{id}", postDetailHandler)\n```'
      );
    });

    it("leaves already fenced code blocks untouched", () => {
      const fenced = '```go\nmux := http.NewServeMux()\n```';
      expect(formatCheckContext(fenced, "go")).toBe(fenced);
    });

    it("leaves purely conceptual prose untouched", () => {
      const prose =
        "An unbuffered channel has no storage. A send waits for a receiver, and a receive waits for a sender. While blocked, that goroutine cannot make progress on its next statement.";
      expect(formatCheckContext(prose, "go")).toBe(prose);
    });

    it("fences code following an introductory lead-in line", () => {
      const mixed =
        'Consider the following router setup:\nmux := http.NewServeMux()\nmux.HandleFunc("GET /posts/{$}", postsListHandler)';
      const formatted = formatCheckContext(mixed, "go");
      expect(formatted).toBe(
        'Consider the following router setup:\n\n```go\nmux := http.NewServeMux()\nmux.HandleFunc("GET /posts/{$}", postsListHandler)\n```'
      );
    });
  });
});
