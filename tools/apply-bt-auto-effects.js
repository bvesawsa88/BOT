/* BT01-BT11 ที่ยังไม่มีเอฟเฟกต์ — เติมออโต้/พาร์เชียลจากคำอธิบายการ์ดแล้ว rebuild */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const META_KEYS = [
  'noPaidSummon', 'noHandSummon', 'milledOptional', 'millBonusExtra', 'millBonusExceptSelf',
  'halvePrintedInsteadDestroy', 'forceAllAvatarSymbol', 'nameAliases', 'sacrificeSummon',
  'freeSummonIf', 'uniqueOnField', 'exactGemPay', 'allColors', 'blockLifeUnreveal',
  'grantKeywordAura', 'grantKeywordIfAllyNameIncludes', 'grantKeywordIfLandNameIncludes',
  'ignoreNegativePower', 'auraPower', 'auraNameIncludes',
  'immuneOppMagicTarget', 'millInsteadDestroy', 'lifeBothModes', 'controlImmune',
  'addToHandWhenScoutedByNameIncludes', 'addToHandWhenMilledOrScoutedByNameIncludes',
  'extraSymbols', 'allSymbols', 'extraColors', 'destroyHostIfPower0', 'powerAsGemForSymbol',
  'gemAsCostForNameIncludes', 'gemAsCostValue', 'gemAsCostColor', 'costOnlyForSymbol', 'revealOppDeckTopIfOwnNameIncludes', 'cannotBeAttackTargetIf',
  'cannotBeAttackTargetIfOwnSymbolOther', 'cannotBeAttackTargetIfOwnNameIncludes', 'onlyAttackableAllyNameIncludes', 'cannotAttack', 'unityOnlyNameIncludes', 'hostSymbolReplace', 'reattachOnHostDestroy', 'reactAnyWindow',
  'destroyHostOnLeave',
  'costZeroIfDistinctOwnNameIncludes', 'costZeroIfOwnSymbol', 'abilitiesFromMagicZone',
  'blockAllLandPlay', 'blockDeckSummon', 'destroyAfterGlobalEndPhases', 'stayOnMagic', 'remainOnMagic',
  'allowOppTurnMagic', 'oncePerTurnCard', 'ignoreReactOncePerTurnLimit', 'revealDeckTops',
  'protectReplace', 'protectReplaceIfHostNameIncludes', 'protectReplaceForNameIncludes',
  'overdoseIfOwnFaceUpLifeMin', 'overdoseSuppressEnemyKeywords', 'overdoseLockOwnAbilities',
  'uniqueAttachedNames', 'uniqueMagicNameIncludes', 'attachOnly', 'hostAttachNameIncludes', 'hostBlockReactUntilCombatEnd', 'suppressVictimDestroyed',
  'stackPowerOnReattach', 'reattachEnemyIfNoOwn',
  'protectAllyNameIncludes', 'attackLimitPerTurn', 'hostCannotAttack', 'hostMustAttack', 'instantWinIf',
  'noHellSummon', 'only', 'replaceFirstDrawWithSelf', 'bounceHostOnLeave', 'returnControlOnLeave', 'untilSourceLeavesZone', 'changeSrcSubtype',
  'combatImmuneVsLowerCost', 'attackIf', 'enemyCostAura', 'setPowerIfAllyNameIncludes', 'setPowerTo',
  'controlImmuneExcept', 'scoutBonusOwnKapom', 'scoutBonusConstruct', 'hostCostDelta',
  'hostPowerIfEffCostMin', 'destroyAnyOnSummonedByAvatarNameIncludes',
  'destroyAnyOnSummonedByAvatarSymbol', 'destroyEnemyAnyOnSummonedByAvatarNameIncludes',
  'drawOnSummonedByAvatarNameIncludes', 'controlImmuneOwnAvatars'
];

function loadJson(name) {
  const p = path.join(ROOT, 'data', name);
  if (!fs.existsSync(p)) return { cards: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(name, j) {
  const p = path.join(ROOT, 'data', name);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

function hasImplementedEffect(e) {
  if (!e) return false;
  if (e.abilities && e.abilities.length > 0) return true;
  if (e.keywords && e.keywords.length > 0) return true;
  for (const k of META_KEYS) {
    if (e[k] != null && e[k] !== false && (!Array.isArray(e[k]) || e[k].length > 0)) return true;
  }
  return false;
}

function parseEffect(card) {
  const text = (card.effect || '').replace(/\s+/g, ' ').trim();
  if (!text) return { abilities: [], parseStatus: 'verified', note: 'ไม่มีข้อความเอฟเฟกต์' };

  const abilities = [];
  let status = 'auto';

  // Life
  if (card.type === 'Life' || /ถูกหงายจากการโจมตี/.test(text)) {
    const m = text.match(/จั่ว(?:การ์ด)?\s*(\d+)/);
    abilities.push({
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: m ? +m[1] : 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // Modification POWER +N
  if (card.subtype === 'Modification') {
    const m = text.match(/POWER\s*\+(\d+)/i);
    if (m) {
      abilities.push({
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
      });
    }
    if (/สวมใส่ได้แค่|สวมใส่ได้เฉพาะ/.test(text)) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const nm = text.match(/Avatar\s*"([^"]+)"/);
      if (sym) return { abilities, attachOnly: { symbol: sym[1].trim() }, parseStatus: abilities.length ? 'auto' : 'partial' };
      if (nm) return { abilities, attachOnly: { nameIncludes: nm[1].trim() }, parseStatus: abilities.length ? 'auto' : 'partial' };
    }
    if (abilities.length) return { abilities, parseStatus: 'auto' };
  }

  // Land POWER
  if (card.subtype === 'Land') {
    const m = text.match(/POWER\s*\+(\d+)/i);
    if (m) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const target = { select: 'all', type: 'Avatar', side: 'any', zone: 'avatarZone' };
      if (sym) target.symbol = sym[1].trim();
      else if (/ฝ่ายเรา/.test(text)) target.side = 'own';
      abilities.push({
        trigger: { on: 'static', if: 'self.zone==landZone' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileOnField', layer: 3, target }]
      });
      return { abilities, parseStatus: 'auto' };
    }
  }

  // React: อุบัติเหตุ — ทำลายตอนอัญเชิญ
  if (card.subtype === 'React' && /เมื่อมี Avatar อัญเชิญ|เมื่อ Avatar .*อัญเชิญ/.test(text) && /ทำลาย/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'avatarSummoned', if: 'any' },
      react: true,
      actions: [{ op: 'destroy', target: { select: 'triggerSource' } }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React: ไปเลยมอนตี้ — ลด POWER ตามจำนวนมือ+สนาม
  if (card.subtype === 'React' && /ประกาศโจมตี/.test(text) && /POWER\s*ลด|ลดลงตามจำนวน/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [{ op: 'weakenAttacker', per: 2, count: ['ownSide'], until: 'endOfTurn' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React: ทำลายผู้โจมตี
  if (card.subtype === 'React' && /ประกาศโจมตี/.test(text) && /ทำลาย Avatar ที่โจมตี|ส่ง.*ที่โจมตี.*นรก|ทำลายผู้โจมตี/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [{ op: 'destroyAttacker' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React generic: enemyDeclareAttack with destroyTarget / cancel — mark partial with trigger so UI shows
  if (card.subtype === 'React' && /ประกาศโจมตี|เป็นเป้าหมายการโจมตี|ถูกโจมตี/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [],
      note: 'ผลซับซ้อน — เล่นมือ/รอเติม'
    });
    return { abilities, parseStatus: 'partial', note: text.slice(0, 80) };
  }

  if (card.subtype === 'React' && /อัญเชิญ/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'avatarSummoned', if: 'any' },
      react: true,
      actions: [],
      note: 'ผลซับซ้อน — เล่นมือ/รอเติม'
    });
    return { abilities, parseStatus: 'partial', note: text.slice(0, 80) };
  }

  // Normal Magic: จั่วอย่างเดียว
  if (card.type === 'Magic' && (card.subtype === 'Normal' || !card.subtype)) {
    const drawOnly = text.match(/^จั่ว(?:การ์ด)?\s*(\d+)\s*ใบ\.?$/);
    if (drawOnly) {
      abilities.push({
        trigger: { on: 'activated' },
        actions: [{ op: 'draw', count: +drawOnly[1], player: 'owner' }]
      });
      return { abilities, parseStatus: 'auto' };
    }
    // ทิ้ง ... จั่ว N
    const discDraw = text.match(/ทิ้ง[\s\S]{0,80}?จั่ว(?:การ์ด)?\s*(\d+)/);
    if (discDraw && /จาก(?:บน)?มือ|จากมือ/.test(text)) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const cost = [{ op: 'discard', from: 'hand', count: 1, filter: { type: 'Avatar' } }];
      if (sym) cost[0].filter.symbol = sym[1].trim();
      abilities.push({
        trigger: { on: 'activated' },
        cost,
        actions: [{ op: 'draw', count: +discDraw[1], player: 'owner' }]
      });
      return { abilities, parseStatus: 'auto' };
    }
    // POWER +N เลือก Avatar
    const buff = text.match(/POWER\s*\+(\d+)[\s\S]{0,40}?(จนจบเทิร์น|จนจบการต่อสู้)?/i);
    if (buff && /เลือก Avatar|Avatar 1 ใบ/.test(text) && !/ทิ้ง|เซ่น|นอน/.test(text.slice(0, 40))) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const target = { select: 'choose', type: 'Avatar', count: 1, side: 'any' };
      if (sym) target.symbol = sym[1].trim();
      abilities.push({
        trigger: { on: 'activated' },
        actions: [{ op: 'modifyPower', amount: +buff[1], duration: 'endOfTurn', layer: 4, target }]
      });
      return { abilities, parseStatus: 'auto' };
    }
  }

  // Avatar จุติ POWER +/-N choose — อย่าหยิบ POWER จากบรรทัดต่อเนื่อง
  if (/จุติ/.test(text)) {
    const m = text.split(/ต่อเนื่อง/)[0].match(/POWER\s*([+-]\d+)/i);
    if (m) {
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'modifyPower', amount: +m[1], duration: 'endOfTurn', layer: 4,
          target: { select: 'choose', type: 'Avatar', count: 1, side: 'any' }
        }]
      });
    } else if (/จั่ว(?:การ์ด)?\s*(\d+)/.test(text)) {
      const d = text.match(/จั่ว(?:การ์ด)?\s*(\d+)/);
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'draw', count: d ? +d[1] : 1, player: 'owner' }]
      });
    } else {
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [],
        note: 'จุติซับซ้อน'
      });
      status = 'partial';
    }
  }

  // อัตโนมัติ เมื่อโจมตี POWER +N — อย่าหยิบ POWER จากบรรทัดต่อเนื่อง
  if (/อัตโนมัติ|อัติโนมัติ/.test(text) && /โจมตี/.test(text)) {
    const autoText = (text.match(/(?:อัตโนมัติ|อัติโนมัติ)[\s\S]*?(?=ต่อเนื่อง|$)/) || [text])[0];
    const m = autoText.match(/POWER\s*\+(\d+)/i);
    if (m) {
      abilities.push({
        keyword: 'อัตโนมัติ',
        trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'endOfTurn', layer: 4, target: { select: 'self' } }]
      });
    }
  }

  // ต่อเนื่อง POWER +N — กรองชื่อในเครื่องหมายคำพูด หรือ symbol
  if (/ต่อเนื่อง/.test(text) && /POWER\s*\+(\d+)/i.test(text)) {
    const m = text.match(/POWER\s*\+(\d+)/i);
    const named = text.match(/ต่อเนื่อง[\s\S]{0,80}?Avatar\s*[“"']([^“"']+)[”"']/);
    const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/) || text.match(/Avatar\s*\{[^}]*symbol\s*([^}]+)\}/i);
    const target = { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone' };
    if (named) target.nameIncludes = [named[1].trim()];
    else if (sym) target.symbol = (sym[1] || '').trim();
    abilities.push({
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==avatarZone' },
      actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileOnField', layer: 3, target }]
    });
  }

  // สามัคคี keyword only
  if (/สามัคคี/.test(text) && !abilities.length) {
    return { keywords: ['สามัคคี'], abilities: [], parseStatus: 'partial', note: 'สามัคคี — keyword' };
  }

  if (abilities.length) return { abilities, parseStatus: status, note: status === 'partial' ? text.slice(0, 100) : undefined };

  // fallback
  return { abilities: [], parseStatus: 'manual', note: text.slice(0, 120) };
}

function main() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
  const btSets = ['bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11'];

  let totalUpdated = 0;

  for (const set of btSets) {
    const fileName = `effects-${set}.json`;
    const data = loadJson(fileName);
    let updatedThisSet = 0;

    data.cards = (data.cards || []).map(sc => {
      const cardInCards = cards.find(c => c.code === sc.code);
      if (!cardInCards) return sc;

      const textEffect = (cardInCards.effect || '').trim();
      if (textEffect === '' || textEffect === '—' || textEffect === '-') {
        // Vanilla card, if parseStatus is stub or undefined, mark verified vanilla
        if (sc.parseStatus === 'stub' || !sc.parseStatus) {
          sc.parseStatus = 'verified';
          sc.abilities = [];
          updatedThisSet++;
        }
        return sc;
      }

      // Check if the card has implemented effects in the current effects file
      const hasFx = hasImplementedEffect(sc);
      const isStub = sc.parseStatus === 'stub';

      if (!hasFx || isStub) {
        const parsed = parseEffect(cardInCards);

        // Merge logic:
        if (parsed.abilities.length > 0 || (parsed.keywords && parsed.keywords.length > 0)) {
          // Automated something!
          sc.abilities = parsed.abilities;
          if (parsed.keywords) sc.keywords = parsed.keywords;
          sc.parseStatus = parsed.parseStatus;
          if (parsed.note) sc.note = parsed.note;
          else delete sc.note;
          updatedThisSet++;
        } else {
          // Parser did not automate (it's manual or partial with empty abilities)
          if (!sc.note) {
            // No note exists, update with parsed status and note (which documents card text)
            sc.parseStatus = parsed.parseStatus;
            sc.note = parsed.note;
            updatedThisSet++;
          }
          // If a note already exists, we preserve the existing developer note as is
        }
      }

      return sc;
    });

    if (updatedThisSet > 0) {
      saveJson(fileName, data);
      console.log(`Updated ${updatedThisSet} cards in ${fileName}`);
      totalUpdated += updatedThisSet;
    }
  }

  console.log(`Total card entries updated: ${totalUpdated}`);

  if (totalUpdated > 0) {
    console.log('Rebuilding abilities database...');
    const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
    if (reb.stdout) process.stdout.write(reb.stdout);
    if (reb.stderr) process.stderr.write(reb.stderr);
    if (reb.status) {
      console.error('Rebuild failed!');
      process.exit(reb.status);
    }
    console.log('Rebuild completed successfully.');
  }
}

main();
