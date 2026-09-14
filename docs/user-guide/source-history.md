# Recent changes and Undo/Redo

Open a project and use **Recent changes** in the editor toolbar to review the changed target, scope, file, time, and available before/after summary. **Undo** reverses the latest eligible source change; **Redo** reapplies the latest eligible undone change. Each action saves a new revision. A shared token appears once in history even when it changes more than one page.

Use Command-Z or Control-Z for source Undo, and Command-Shift-Z, Control-Shift-Z, or Control-Y for source Redo. While typing in a field, these keys retain the field's normal text-editing behavior. Finish or discard a pending inspector draft before using source history.

If Stellar reports that source changed, reload and review the latest revision before making another edit. If a save result is unknown, use **Check save**; Stellar looks up the original request ID instead of issuing the write again. History remains on disk after closing the project or restarting the runner. A preview failure does not erase an already saved source revision.
