import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGameCommand, emptyGameData, type Game } from "./survival-game";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const actor = { id, full_name: "Player", role: "employee" };
const players = [{ id, full_name: "Player" }];
const game: Game = { id, title: "Implants", detail: "Annual implants", audience: "Office", members: [id], kind: "Reach a goal", unit: "implants", current: 130, goal: 150, start: "2026-01-01", end: "2026-12-31", repeat: false, points: 500, verification: "Trusted updates", archived: false, completed: false, sides: ["A","B"], scores: [0,0] };
const state = () => ({ ...structuredClone(emptyGameData), games: [structuredClone(game)] });
test("trusted progress is attributed and awards exactly once", () => {
  const a = applyGameCommand(state(), { type: "progress", id, before: 130, value: 150, note: "Confirmed" }, actor, players);
  assert.equal(a.games[0].current, 150); assert.equal(a.updates[0].person,id); assert.equal(a.balances[id],500); assert.equal(a.requests.length,0);
  const b = applyGameCommand(a, { type: "progress", id, before: 150, value: 151, note: "" }, actor, players);
  assert.equal(b.balances[id],500);
  const c = applyGameCommand(b, { type: "progress", id, before: 151, value: 149, note: "Correction" }, actor, players);
  assert.equal(c.balances[id],0); assert.equal(c.games[0].completed,false);
});
test("nonparticipants and nonadmin managers are rejected", () => {
  assert.throws(() => applyGameCommand(state(), { type: "progress", id, before:130, value:132, note:"" }, { ...actor,id:other },players));
  assert.throws(() => applyGameCommand(state(), { type:"archive",id,archived:true },actor,players));
  assert.throws(() => applyGameCommand(state(), { type:"saveGame",game },actor,players));
});
test("stale totals and invalid values are rejected", () => {
  assert.throws(() => applyGameCommand(state(), { type:"progress",id,before:129,value:132,note:"" },actor,players));
  assert.throws(() => applyGameCommand(state(), { type:"progress",id,before:130,value:-1,note:"" },actor,players));
});
test("optional approval does not update progress until an admin approves", () => {
  const s=state(); s.games[0].verification="Manager approval";
  const a=applyGameCommand(s,{type:"progress",id,before:130,value:132,note:"Check"},actor,players);
  assert.equal(a.games[0].current,130); assert.equal(a.requests.length,1);
  const b=applyGameCommand(a,{type:"decide",id:a.requests[0].id,approve:true},{...actor,role:"admin"},players);
  assert.equal(b.games[0].current,132); assert.equal(b.updates[0].person,id);
});
test("reward reservation and refund cannot be replayed", () => {
  const s=state(); s.balances[id]=500; s.rewards=[{id,title:"Coffee",points:250}];
  const a=applyGameCommand(s,{type:"reward",id},actor,players); assert.equal(a.balances[id],250);
  const b=applyGameCommand(a,{type:"decide",id:a.requests[0].id,approve:false},{...actor,role:"admin"},players); assert.equal(b.balances[id],500);
  assert.throws(() => applyGameCommand(b,{type:"decide",id:a.requests[0].id,approve:false},{...actor,role:"admin"},players));
});
test("admin cannot assign someone outside the office", () => {
  assert.throws(() => applyGameCommand(state(),{type:"saveGame",game:{...game,members:[other]}},{...actor,role:"admin"},players));
});

const competitors = [...players, { id: other, full_name: "Lisa" }];
const contest = () => {
  const s = state();
  s.games[0] = { ...game, audience: "Individual", kind: "Compete", members: [id, other] };
  return s;
};
test("individual competition accepts multiple players; individual goals still require one", () => {
  const g = contest().games[0];
  const admin = { ...actor, role: "admin" };
  assert.doesNotThrow(() => applyGameCommand(state(), { type: "saveGame", game: g }, admin, competitors));
  assert.throws(() => applyGameCommand(state(), { type: "saveGame", game: { ...g, members: [id] } }, admin, competitors), /two competitors/);
  assert.throws(() => applyGameCommand(state(), { type: "saveGame", game: { ...g, kind: "Reach a goal" } }, admin, competitors), /one participant/);
});
test("trusted competitor updates only their own score with no approval or shared-total change", () => {
  const a = applyGameCommand(contest(), { type: "progress", id, before: 0, value: 3, note: "Three kits" }, actor, competitors);
  const b = applyGameCommand(a, { type: "progress", id, before: 0, value: 5, note: "" }, { ...actor, id: other }, competitors);
  assert.deepEqual(b.games[0].individualScores, { [id]: 3, [other]: 5 });
  assert.equal(b.games[0].current, 130);
  assert.equal(b.requests.length, 0);
  assert.deepEqual(b.balances, {});
  assert.equal(b.updates[0].person, other);
  assert.throws(() => applyGameCommand(b, { type: "progress", id, person: other, before: 5, value: 8, note: "" }, actor, competitors), /administrator/);
  assert.throws(() => applyGameCommand(b, { type: "progress", id, before: 0, value: 8, note: "" }, actor, competitors), /count changed/);
});
test("manager corrections identify both competitor and editor; settings preserve scores", () => {
  const admin = { ...actor, role: "admin" };
  const a = applyGameCommand(contest(), { type: "progress", id, person: other, before: 0, value: 4, note: "Correction" }, admin, competitors);
  assert.equal(a.updates[0].person, other);
  assert.equal(a.updates[0].recordedBy, id);
  const b = applyGameCommand(a, { type: "saveGame", game: { ...a.games[0], individualScores: { [other]: 999 } } }, admin, competitors);
  assert.equal(b.games[0].individualScores?.[other], 4);
});
test("competition approval updates the submitting player, not the approver", () => {
  const s = contest(); s.games[0].verification = "Manager approval";
  const a = applyGameCommand(s, { type: "progress", id, before: 0, value: 7, note: "" }, { ...actor, id: other }, competitors);
  assert.equal(a.games[0].individualScores, undefined);
  const b = applyGameCommand(a, { type: "decide", id: a.requests[0].id, approve: true }, { ...actor, role: "admin" }, competitors);
  assert.equal(b.games[0].individualScores?.[other], 7);
  assert.equal(b.games[0].individualScores?.[id], undefined);
});
test("manager-entry and archived competitions still restrict updates", () => {
  const s = contest(); s.games[0].verification = "Manager entry";
  assert.throws(() => applyGameCommand(s, { type: "progress", id, before: 0, value: 3, note: "" }, actor, competitors), /administrator/);
  s.games[0].archived = true;
  assert.throws(() => applyGameCommand(s, { type: "progress", id, before: 0, value: 3, note: "" }, { ...actor, role: "admin" }, competitors), /cannot update/);
});
test("team competitions keep their two-sided scoreboard and manager-only behavior", () => {
  const s = contest(); s.games[0].audience = "Team";
  assert.throws(() => applyGameCommand(s, { type: "progress", id, before: 130, value: 3, note: "" }, actor, competitors), /administrator/);
  const a = applyGameCommand(s, { type: "saveGame", game: { ...s.games[0], scores: [10, 8] } }, { ...actor, role: "admin" }, competitors);
  assert.deepEqual(a.games[0].scores, [10, 8]);
});
