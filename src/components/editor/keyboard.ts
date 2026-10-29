/** Editor shortcuts must not consume a coach/composer shortcut or a modal action. */
export function editorShortcutApplies(
  event: Pick<
    KeyboardEvent,
    "metaKey" | "ctrlKey" | "key" | "defaultPrevented"
  >,
  ownsFocus: boolean,
  dialogOpen: boolean
): boolean {
  return (
    ownsFocus &&
    !dialogOpen &&
    !event.defaultPrevented &&
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter"
  );
}
