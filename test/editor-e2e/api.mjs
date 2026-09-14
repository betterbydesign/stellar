import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export function editorApi(context, appOrigin) {
  let csrf;
  const id = () => "proof-" + randomUUID();
  async function request(method, path, data) {
    if (!csrf) {
      const operator = await context.request.get(appOrigin + "/api/operator/session");
      assert.equal(operator.status(), 200, "Operator must connect through the browser first");
      csrf = (await operator.json()).csrfToken;
    }
    const response = await context.request.fetch(appOrigin + path, {
      method, headers: { origin: appOrigin, "x-stellar-csrf": csrf }, ...(data ? { data } : {}),
    });
    return { status: response.status(), data: await response.json() };
  }
  const checked = (result) => {
    assert.equal(result.status, 200, `API failed: ${JSON.stringify(result.data)}`);
    return result.data;
  };
  return {
    id, request, checked,
    async list() { return checked(await request("GET", "/api/projects?requestId=" + id())); },
    session(projectId, sessionId) {
      const prefix = `/api/projects/${projectId}/sessions/${sessionId}`;
      const scope = () => ({ protocolVersion: "stellar.editor.v1", projectId, sessionId, requestId: id() });
      return {
        prefix, scope,
        async model(pageId = "home") { return checked(await request("GET", `${prefix}/source-model?pageId=${pageId}&requestId=${id()}`)); },
        async history() { return checked(await request("GET", `${prefix}/history?requestId=${id()}`)); },
        async current() { return checked(await request("GET", `${prefix}?requestId=${id()}`)); },
        async prepare(target, command) { return checked(await request("POST", prefix + "/changes/prepare", { ...scope(), targetId: target.targetId, expectedRevision: target.revision, command })); },
        async apply(proposal, requestId = id()) {
          return checked(await request("POST", prefix + "/changes/apply", { ...scope(), requestId, proposalId: proposal.proposalId, expectedRevision: proposal.baseRevision }));
        },
      };
    },
  };
}
