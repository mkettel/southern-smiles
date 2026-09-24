import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGameCommand, emptyGameData, officeRewardShares, rewardLabel, type Game } from "./survival-game";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const actor = { id, full_name: "Player", role: "employee" };
const players = [{ id, full_name: "Player" }];
const game: Game = { id, title: "Implants", detail: "Annual implants", audience: "Office", members: [id], kind: "Reach a goal", unit: "implants", current: 130, goal: 150, start: "2026-01-01", end: "2026-12-31", repeat: false, points: 500, verification: "Trusted updates", archived: false, completed: false, sides: ["A","B"], scores: [0,0] };
const state = () => ({ ...structuredClone(emptyGameData), games: [structuredClone(game)] });
const cashGame = (): Game => ({ ...game, points: 0, officeReward: { poolCents: 150000, units: { [id]: 2 } } });
const admin = { ...actor, role: "admin" };
const guest = { id: other, full_name: "Irma" };
test("admins add game-only participants without enrolling them or creating accounts", () => {
  const a = applyGameCommand(state(), { type: "saveGuest", player: { ...guest, full_name: " Irma " } }, admin, players);
  assert.deepEqual(a.guestPlayers, [guest]);
  assert.deepEqual(a.games[0].members, [id]);
  assert.equal(players.length, 1);
  assert.match(a.history[0], /Added game-only participant Irma/);
  assert.throws(() => applyGameCommand(state(), { type: "saveGuest", player: guest }, actor, players), /administrator/);
});
test("guest names and identities are validated without overwriting Board accounts", () => {
  const a = applyGameCommand(state(), { type: "saveGuest", player: guest }, admin, players);
  for (const player of [
    { ...guest, full_name: " " },
    { ...guest, id, full_name: "Irma" },
    { ...guest, full_name: "player" },
    { id: "00000000-0000-4000-8000-000000000003", full_name: " irMA " },
  ]) assert.throws(() => applyGameCommand(a, { type: "saveGuest", player }, admin, players));
});
test("only registered guests can join games and receive office rewards", () => {
  const g = { ...cashGame(), members: [id, other], officeReward: { poolCents: 150000, units: { [id]: 2, [other]: 1 } } };
  assert.throws(() => applyGameCommand(state(), { type: "saveGame", game: g }, admin, players));
  const a = applyGameCommand(state(), { type: "saveGuest", player: guest }, admin, players);
  const b = applyGameCommand(a, { type: "saveGame", game: g }, admin, players);
  const c = applyGameCommand(b, { type: "progress", id, before: 130, value: 150, note: "" }, admin, players);
  assert.equal(c.cashAwards?.[id][other], 50000);
});
test("admin records guest scores; renaming retains membership and attribution", () => {
  const a = applyGameCommand(state(), { type: "saveGuest", player: guest }, admin, players);
  const b = applyGameCommand(a, { type: "saveGame", game: { ...game, audience: "Individual", kind: "Compete", members: [id, other] } }, admin, players);
  const command = { type: "progress", id, person: other, before: 0, value: 3, note: "Irma sold three kits" };
  assert.throws(() => applyGameCommand(b, command, actor, players), /administrator/);
  const c = applyGameCommand(b, command, admin, players);
  const d = applyGameCommand(c, { type: "saveGuest", player: { ...guest, full_name: "Irma Updated" } }, admin, players);
  assert.equal(d.games[0].individualScores?.[other], 3);
  assert.equal(d.updates[0].person, other);
  assert.equal(d.updates[0].recordedBy, id);
  assert.deepEqual(d.games[0].members, [id, other]);
  assert.equal(d.guestPlayers?.length, 1);
  assert.throws(() => applyGameCommand(d, { type: "saveGuest", player: guest }, actor, players), /administrator/);
});
test("office pool uses 7.5 units, not a per-person reward", () => {
  const units = { doctor: 2, a: 1, b: 1, c: 1, d: 1, e: 1, evelis: 0.5, excluded: 0 };
  const shares = officeRewardShares({ poolCents: 150000, units });
  assert.equal(shares.doctor, 40000);
  assert.equal(shares.a, 20000);
  assert.equal(shares.evelis, 10000);
  assert.equal(shares.excluded, undefined);
  assert.equal(Object.values(shares).reduce((a,b) => a+b, 0), 150000);
  assert.equal(rewardLabel(cashGame()), "$1,500.00 office pool");
});
test("cash allocations preserve every cent deterministically", () => {
  const reward = { poolCents: 100, units: { b: 1, a: 1, c: 1 } };
  assert.deepEqual(officeRewardShares(reward), { a: 34, b: 33, c: 33 });
  assert.deepEqual(officeRewardShares({ ...reward, units: { c: 1, a: 1, b: 1 } }), officeRewardShares(reward));
  assert.deepEqual(officeRewardShares({ poolCents: 100, units: { a: 0 } }), {});
});
test("cash completion and correction do not create points or payments", () => {
  const s = state(); s.games[0] = cashGame();
  const a = applyGameCommand(s, { type: "progress", id, before: 130, value: 150, note: "" }, actor, players);
  assert.deepEqual(a.balances, {});
  assert.deepEqual(a.awards, {});
  assert.deepEqual(a.cashAwards?.[id], { [id]: 150000 });
  const b = applyGameCommand(a, { type: "progress", id, before: 150, value: 151, note: "" }, actor, players);
  assert.deepEqual(b.cashAwards, a.cashAwards);
  const c = applyGameCommand(b, { type: "progress", id, before: 151, value: 149, note: "Correction" }, actor, players);
  assert.equal(c.cashAwards?.[id], undefined);
  assert.equal(c.games[0].completed, false);
});
test("invalid cash allocations, mixed points, and non-office pools are rejected", () => {
  const admin = { ...actor, role: "admin" };
  for (const g of [
    { ...cashGame(), points: 100 },
    { ...cashGame(), audience: "Team" },
    { ...cashGame(), kind: "Compete" },
    { ...cashGame(), officeReward: { poolCents: 0, units: { [id]: 2 } } },
    { ...cashGame(), officeReward: { poolCents: 100, units: { [id]: 0 } } },
    { ...cashGame(), officeReward: { poolCents: 100, units: { [id]: 0.3 } } },
    { ...cashGame(), officeReward: { poolCents: 100, units: { [other]: 1 } } },
  ]) assert.throws(() => applyGameCommand(state(), { type: "saveGame", game: g }, admin, players));
});
test("completed cash pool cannot be silently changed", () => {
  const s = state(); s.games[0] = cashGame();
  const a = applyGameCommand(s, { type: "progress", id, before: 130, value: 150, note: "" }, actor, players);
  assert.throws(() => applyGameCommand(a, { type: "saveGame", game: { ...a.games[0], officeReward: { poolCents: 200000, units: { [id]: 2 } } } }, { ...actor, role: "admin" }, players), /Reopen/);
});
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
