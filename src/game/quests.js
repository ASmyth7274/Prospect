// Quest + bounty progress tracking, delivery and rewards.
import { QUESTS, BOUNTY_TEMPLATES } from '../data/quests.js';
import { MINERAL_BY_ID, TIERS } from '../data/minerals.js';
import { takeMinerals } from './state.js';
import { newUid } from './loot.js';

export class QuestManager {
  constructor(game) {
    this.game = game;
  }

  get save() {
    return this.game.save;
  }

  status(qid) {
    const s = this.save.quests;
    if (s.done[qid]) return 'done';
    if (s.active[qid]) return this.isComplete(qid) ? 'ready' : 'active';
    const q = QUESTS[qid];
    if (q.requires && !q.requires.every((r) => s.done[r])) return 'locked';
    return 'available';
  }

  // first actionable quest for an NPC
  npcQuest(npc) {
    if (!npc.quests) return null;
    for (const qid of npc.quests) {
      const st = this.status(qid);
      if (st === 'ready' || st === 'active' || st === 'available') return { qid, st };
    }
    return null;
  }

  accept(qid) {
    const q = QUESTS[qid];
    this.save.quests.active[qid] = { prog: q.objectives.map(() => 0) };
    this.game.ui?.toast(`📜 Quest accepted: ${q.name}`);
    this.game.audio?.play('open');
    // display/level objectives may already be satisfied
    this.refreshPassive();
  }

  objectiveProgress(qid, i) {
    const q = QUESTS[qid] || this.bountyDef(qid);
    const o = q.objectives[i];
    const a = this.save.quests.active[qid];
    if (o.type === 'deliver') return Math.min(o.n, this.deliverableCount(o));
    if (o.type === 'display') return Math.min(o.n, Object.keys(this.save.museum).length);
    return Math.min(o.n, a ? a.prog[i] : 0);
  }

  deliverableCount(o) {
    if (o.mineral) return this.save.inv.filter((it) => it.id === o.mineral).length;
    if (o.tier !== undefined) return this.save.inv.filter((it) => MINERAL_BY_ID[it.id]?.tier === o.tier).length;
    return 0;
  }

  isComplete(qid) {
    const q = QUESTS[qid];
    if (!q) return false;
    return q.objectives.every((o, i) => this.objectiveProgress(qid, i) >= o.n);
  }

  turnIn(qid) {
    const q = QUESTS[qid];
    if (!this.isComplete(qid)) return false;
    // consume deliveries
    for (const o of q.objectives) {
      if (o.type !== 'deliver') continue;
      const pred = o.mineral ? (it) => it.id === o.mineral : (it) => MINERAL_BY_ID[it.id]?.tier === o.tier;
      takeMinerals(this.save, pred, o.n);
    }
    delete this.save.quests.active[qid];
    this.save.quests.done[qid] = true;
    this.grant(q.rewards, q.name);
    this.game.ui?.questComplete(q);
    this.game.audio?.play('quest');
    // auto-accept follow-up quests for the same NPC? Leave for the NPC dialog.
    if (q.rewards.flags) for (const f of q.rewards.flags) this.game.setFlag(f, true);
    return true;
  }

  grant(r, source) {
    const g = this.game;
    const s = this.save;
    if (r.money) g.addMoney(r.money, false);
    if (r.shards) g.addShards(r.shards);
    if (r.xp) g.addXP(r.xp);
    if (r.items) for (const [id, n] of Object.entries(r.items)) s.items.consumables[id] = (s.items.consumables[id] || 0) + n;
    if (r.rings) for (const [id, n] of Object.entries(r.rings)) s.rings.owned[id] = (s.rings.owned[id] || 0) + n;
    if (r.minerals) {
      for (const [id, n] of Object.entries(r.minerals)) {
        for (let i = 0; i < n; i++) {
          const m = MINERAL_BY_ID[id];
          s.inv.push({ uid: newUid(), id, kg: Math.round(m.kg * 1.2 * 1000) / 1000, mods: [], t: Date.now(), site: 'quest' });
        }
      }
    }
  }

  // ---- progress hooks ----
  bump(type, amount, match = () => true) {
    const s = this.save;
    for (const [qid, a] of Object.entries(s.quests.active)) {
      const q = QUESTS[qid];
      if (!q) continue;
      q.objectives.forEach((o, i) => {
        if (o.type === type && match(o) && a.prog[i] < o.n) {
          const before = a.prog[i];
          a.prog[i] = Math.min(o.n, a.prog[i] + amount);
          if (a.prog[i] >= o.n && before < o.n) this.game.ui?.toast(`✅ ${q.name}: objective complete!`);
        }
      });
      if (this.isComplete(qid) && !a.notified) {
        a.notified = true;
        const npcName = this.game.npcName(q.npc);
        this.game.ui?.toast(`📜 "${q.name}" is ready! Return to ${npcName}.`, 'quest');
      }
    }
    for (const b of s.bounties.list) {
      if (b.done || b.type !== type) continue;
      if (b.tier !== undefined && !match({ tier: b.tier })) continue;
      if (b.mod && !match({ mod: b.mod })) continue;
      b.prog = Math.min(b.n, b.prog + amount);
      if (b.prog >= b.n) {
        b.done = true;
        this.game.ui?.toast(`📋 Bounty complete: ${b.label}! Claim it at a Notice Board.`, 'quest');
        this.game.audio?.play('quest');
      }
    }
  }

  onDig(siteId) {
    this.bump('dig', 1, (o) => !o.site || o.site === siteId);
  }
  onPerfect() {
    this.bump('perfect', 1);
  }
  onPan() {
    this.bump('pan', 1);
  }
  onSell(count, value) {
    this.bump('sell', count);
    this.bump('earn', value);
  }
  onBuy() {
    this.bump('buy', 1);
  }
  onCraft() {
    this.bump('craft', 1);
  }
  onShards(n) {
    this.bump('shards', n);
  }
  onGeode() {
    this.bump('geode', 1);
  }
  onFind(item, areaId) {
    const m = MINERAL_BY_ID[item.id];
    this.bump('find', 1, (o) => {
      if (o.tier !== undefined && m.tier < o.tier) return false;
      if (o.mineral && o.mineral !== item.id) return false;
      if (o.mod === 'any' && !(item.mods && item.mods.length)) return false;
      if (o.area && o.area !== areaId) return false;
      return true;
    });
  }

  refreshPassive() {
    // re-evaluate completion notifications for display objectives etc.
    for (const [qid, a] of Object.entries(this.save.quests.active)) {
      if (this.isComplete(qid) && !a.notified) {
        a.notified = true;
        this.game.ui?.toast(`📜 "${QUESTS[qid].name}" is ready! Return to ${this.game.npcName(QUESTS[qid].npc)}.`, 'quest');
      }
    }
  }

  // ---- bounties ----
  bountyDef() {
    return null;
  }

  ensureBounties() {
    const s = this.save;
    const day = Math.floor(Date.now() / 86400000);
    if (s.bounties.day !== day || !s.bounties.list.length) {
      s.bounties.day = day;
      s.bounties.list = [];
      for (let i = 0; i < 3; i++) s.bounties.list.push(this.makeBounty(i));
    }
  }

  makeBounty(seed) {
    const t = BOUNTY_TEMPLATES[Math.floor(Math.random() * BOUNTY_TEMPLATES.length)];
    const tough = this.game.stats?.toughness || 1;
    const scale = Math.pow(2.6, tough - 1);
    let n = Math.round(t.n[0] + Math.random() * (t.n[1] - t.n[0]));
    let label;
    if (t.money) {
      n = Math.round(15000 * scale * (0.6 + Math.random() * 0.8));
      n = Math.round(n / 100) * 100;
    }
    label = t.label(n);
    const money = Math.round((t.money ? n * 0.25 : 2500 * scale * (0.7 + n / (t.n[1] || 1))) / 50) * 50;
    const shards = 5 + Math.floor(Math.random() * 10) + tough * 2;
    return { id: newUid(), type: t.type, n, prog: 0, label, tier: t.tier, mod: t.mod, reward: { money, shards, xp: Math.round(money / 20) }, done: false, claimed: false };
  }

  claimBounty(id) {
    const s = this.save;
    const b = s.bounties.list.find((x) => x.id === id);
    if (!b || !b.done || b.claimed) return;
    b.claimed = true;
    this.grant(b.reward, 'Bounty');
    this.game.audio?.play('coin', { n: 4 });
    this.game.ui?.toast(`💰 Bounty reward: $${b.reward.money.toLocaleString()} + ${b.reward.shards} shards`);
    // replace with a new one
    const idx = s.bounties.list.indexOf(b);
    s.bounties.list[idx] = this.makeBounty(idx);
  }
}
