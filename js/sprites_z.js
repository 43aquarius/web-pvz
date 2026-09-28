/* web-pvz — sprites_z.js
 * 僵尸程序化绘制：7 种僵尸 + 行走/啃食/死亡动画 + 配件（路障/铁桶/报纸/头盔/旗帜/撑杆）
 */
(function (global) {
  'use strict';
  const PVZ = (global.PVZ = global.PVZ || {});
  const { U } = PVZ;
  const SZ = {};

  /* 调色板：正常 / 冰冻 */
  const PAL = {
    normal: {
      skin: '#A8B878', skinDark: '#8A9A5A', skinLine: '#6A7A40',
      shirt: '#8898A8', shirtDark: '#68788A', tie: '#B83838',
      pants: '#5A5848', hair: '#4A4A38',
    },
    chilled: {
      skin: '#8FB4D8', skinDark: '#6E96C0', skinLine: '#527898',
      shirt: '#7890B0', shirtDark: '#5A7090', tie: '#7080C0',
      pants: '#485058', hair: '#3A4450',
    },
  };
  SZ.PAL = PAL;

  /* 胶囊肢体 */
  const limb = (ctx, x0, y0, len, w, angle, color) => {
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    U.rr(ctx, -w / 2, 0, w, len, w / 2);
    ctx.fill();
    ctx.restore();
  };

  /* 头部 */
  const head = (ctx, opt = {}) => {
    const p = opt.p;
    ctx.save();
    ctx.translate(0, -70);
    ctx.rotate(opt.tilt || 0);
    /* 后脑 */
    ctx.fillStyle = p.skinDark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 15.5, 0, 0, Math.PI * 2);
    ctx.fill();
    /* 脸 */
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.ellipse(1, 0.5, 12.5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.skinLine;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    /* 凌乱头发 */
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -12); ctx.lineTo(-10, -18);
    ctx.moveTo(-2, -14); ctx.lineTo(-2, -20);
    ctx.moveTo(5, -13); ctx.lineTo(8, -18);
    ctx.stroke();
    /* 眼窝（一只大一只小，无神） */
    ctx.fillStyle = '#3A4A28';
    ctx.beginPath();
    ctx.ellipse(3, -4, 3.6, 4.2, 0, 0, Math.PI * 2);
    ctx.ellipse(-6, -3, 2.8, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E8E8D0';
    ctx.beginPath();
    ctx.arc(3.6, -4.6, 1.3, 0, Math.PI * 2);
    ctx.arc(-5.6, -3.6, 1, 0, Math.PI * 2);
    ctx.fill();
    /* 嘴：啃食时张合 */
    const jaw = opt.jaw || 0;
    ctx.fillStyle = '#2A3218';
    ctx.beginPath();
    ctx.ellipse(4, 6, 5.5, 2 + jaw * 5, 0, 0, Math.PI * 2);
    ctx.fill();
    /* 牙 */
    ctx.fillStyle = '#D8D8C0';
    ctx.beginPath();
    ctx.rect(1.5, 4, 2.2, 2.5);
    ctx.rect(5.5, 4, 2.2, 2.5);
    ctx.fill();
    ctx.restore();
  };

  /* 路障锥 */
  const cone = (ctx) => {
    ctx.save();
    ctx.translate(0, -84);
    ctx.rotate(-0.06);
    const g = ctx.createLinearGradient(-12, 0, 12, 0);
    g.addColorStop(0, '#F89838');
    g.addColorStop(1, '#D87018');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-13, 8);
    ctx.quadraticCurveTo(-4, -8, -2.5, -26);
    ctx.lineTo(2.5, -26);
    ctx.quadraticCurveTo(4, -8, 13, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F0F0E8';
    ctx.beginPath();
    ctx.moveTo(-9.5, 1); ctx.lineTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(9.5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#A85818';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-4, -8, -2.5, -26);
    ctx.lineTo(2.5, -26); ctx.quadraticCurveTo(4, -8, 13, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  /* 铁桶 */
  const bucket = (ctx, dented) => {
    ctx.save();
    ctx.translate(0, -85);
    ctx.rotate(-0.05);
    const g = ctx.createLinearGradient(-14, 0, 14, 0);
    g.addColorStop(0, '#B8BCC0');
    g.addColorStop(0.5, '#989CA2');
    g.addColorStop(1, '#787C84');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-13, -26);
    ctx.lineTo(13, -26);
    ctx.lineTo(15, 8);
    ctx.lineTo(-15, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5A5E64';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    /* 桶箍 */
    ctx.strokeStyle = '#C8CCD0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14.2, -18); ctx.lineTo(14.2, -18);
    ctx.moveTo(-14.8, -2); ctx.lineTo(14.8, -2);
    ctx.stroke();
    /* 凹痕 */
    if (dented) {
      ctx.strokeStyle = '#606468';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, -22); ctx.lineTo(-2, -14); ctx.lineTo(-7, -6);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* 报纸 */
  const newspaper = (ctx) => {
    ctx.save();
    ctx.translate(6, -42);
    ctx.rotate(0.12);
    ctx.fillStyle = '#E8E8E0';
    U.rr(ctx, -16, -14, 34, 28, 2);
    ctx.fill();
    ctx.strokeStyle = '#B0B0A8';
    ctx.lineWidth = 1;
    U.rr(ctx, -16, -14, 34, 28, 2);
    ctx.stroke();
    /* 标题条 */
    ctx.fillStyle = '#787870';
    ctx.fillRect(-13, -11, 28, 4);
    /* 文字行 */
    ctx.fillStyle = '#A8A8A0';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-13, -4 + i * 5, 22 - (i % 2) * 8, 2.4);
    }
    ctx.restore();
  };

  /* 橄榄头盔 */
  const footballHelmet = (ctx) => {
    ctx.save();
    ctx.translate(0, -82);
    const g = ctx.createLinearGradient(-14, -10, 14, 10);
    g.addColorStop(0, '#E85858');
    g.addColorStop(1, '#B02828');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -4, 15, 14, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#801818';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    /* 白条 */
    ctx.strokeStyle = '#F0F0F0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(0, 8);
    ctx.stroke();
    /* 面罩 */
    ctx.strokeStyle = '#C8C8D0';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(13, -2);
    ctx.quadraticCurveTo(18, 4, 13, 9);
    ctx.moveTo(13, 1); ctx.lineTo(8, 2);
    ctx.moveTo(13, 6); ctx.lineTo(8, 7);
    ctx.stroke();
    ctx.restore();
  };

  /* 旗帜 */
  const flagPole = (ctx, t) => {
    ctx.save();
    ctx.translate(8, -52);
    ctx.rotate(-0.5);
    ctx.strokeStyle = '#8A5A30';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -46); ctx.stroke();
    const wave = Math.sin(t * 6) * 4;
    ctx.fillStyle = '#D83020';
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.quadraticCurveTo(14, -42 + wave, 26, -38 + wave);
    ctx.quadraticCurveTo(14, -34 + wave, 0, -30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F0E8C8';
    ctx.beginPath();
    ctx.arc(10, -38 + wave * 0.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* 撑杆 */
  const vaultPole = (ctx, angle) => {
    ctx.save();
    ctx.translate(4, -40);
    ctx.rotate(angle != null ? angle : -0.9);
    ctx.strokeStyle = '#C8A860';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, -34); ctx.stroke();
    ctx.strokeStyle = '#A88848';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1.5, 26); ctx.lineTo(-1.5, -34); ctx.stroke();
    ctx.restore();
  };

  /* ============ 主体绘制 ============ */
  /*
   * z: 僵尸实例 {
   *   type, anim: {t, phase, eating, dying, deathT, walkSpeed, jaw, rage, chilled...}
   * }
   */
  SZ.draw = (ctx, z) => {
    const t = z.anim.t;
    const pal = z.chill > 0 ? PAL.chilled : PAL.normal;
    const eating = z.anim.eating;
    const dying = z.anim.dying;
    const phase = t * (z.anim.walkRate || 3);

    ctx.save();
    /* 死亡：前倾倒下 */
    if (dying) {
      const dp = U.clamp(z.anim.deathT / 0.9, 0, 1);
      const rot = (1 - Math.pow(1 - dp, 2)) * 1.45;
      ctx.translate(0, 0);
      ctx.rotate(rot);
      ctx.globalAlpha = z.anim.deathT > 1.1 ? U.clamp(1 - (z.anim.deathT - 1.1) / 0.6, 0, 1) : 1;
    }

    /* 阴影在 board 层统一绘制 */

    const legSwing = eating ? 0.08 : Math.sin(phase) * 0.32;
    const bob = eating ? 0 : Math.abs(Math.sin(phase)) * 2.2;
    const lean = eating ? 0.1 : 0.08 + Math.sin(phase * 0.5) * 0.02;

    /* —— 远侧腿 —— */
    limb(ctx, -2, -38, 36, 9, -legSwing + 0.06, pal.pants);
    /* —— 远侧手臂（前伸摆动） —— */
    const armSwing = eating ? Math.sin(t * 10) * 0.22 : Math.sin(phase + Math.PI) * 0.1;
    limb(ctx, -3, -60 + bob * 0.5, 30, 8, 1.25 + armSwing, pal.shirtDark);
    /* 手 */
    ctx.save();
    ctx.translate(-3 + Math.cos(1.25 + armSwing) * 30, -60 + bob * 0.5 + Math.sin(1.25 + armSwing) * 30);
    ctx.fillStyle = pal.skinDark;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* —— 躯干 —— */
    ctx.save();
    ctx.translate(0, bob * 0.4);
    ctx.rotate(lean);
    /* 衬衫 */
    const tg = ctx.createLinearGradient(-11, 0, 11, 0);
    tg.addColorStop(0, pal.shirt);
    tg.addColorStop(1, pal.shirtDark);
    ctx.fillStyle = tg;
    U.rr(ctx, -11, -64, 22, 30, 6);
    ctx.fill();
    /* 破烂下摆 */
    ctx.fillStyle = pal.shirtDark;
    ctx.beginPath();
    ctx.moveTo(-11, -36);
    ctx.lineTo(-11, -32); ctx.lineTo(-6, -36); ctx.lineTo(-2, -31);
    ctx.lineTo(3, -36); ctx.lineTo(8, -32); ctx.lineTo(11, -35);
    ctx.lineTo(11, -36);
    ctx.closePath();
    ctx.fill();
    /* 领带 */
    ctx.fillStyle = pal.tie;
    ctx.beginPath();
    ctx.moveTo(2, -62); ctx.lineTo(7, -60); ctx.lineTo(6, -46); ctx.lineTo(2, -44);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* —— 近侧腿 —— */
    limb(ctx, 3, -38, 38, 10, legSwing, pal.pants);
    ctx.save();
    ctx.translate(3 + Math.sin(legSwing) * 34, -38 + Math.cos(legSwing) * 34);
    ctx.fillStyle = '#3A382E';
    U.rr(ctx, -6, -4, 12, 6, 2);
    ctx.fill();
    ctx.restore();

    /* —— 头 —— */
    ctx.save();
    ctx.translate(2, bob * 0.5 + (eating ? Math.sin(t * 10) * 1.2 : Math.sin(phase) * 1.4));
    head(ctx, {
      p: pal,
      tilt: lean * 0.7 + (eating ? 0.12 : 0),
      jaw: eating ? (Math.sin(t * 10) * 0.5 + 0.5) : (dying ? 0.6 : 0.12),
    });
    ctx.restore();

    /* —— 配件 —— */
    switch (z.type) {
      case 'cone':
        if (z.helmHp > 0) {
          ctx.save();
          ctx.translate(2, bob * 0.5 + (eating ? Math.sin(t * 10) * 1.2 : Math.sin(phase) * 1.4));
          cone(ctx, z.helmHp < z.helmMaxHp * 0.35);
          ctx.restore();
        }
        break;
      case 'bucket':
        if (z.helmHp > 0) {
          ctx.save();
          ctx.translate(2, bob * 0.5 + (eating ? Math.sin(t * 10) * 1.2 : Math.sin(phase) * 1.4));
          bucket(ctx, z.helmHp < z.helmMaxHp * 0.35);
          ctx.restore();
        }
        break;
      case 'football':
        if (z.helmHp > 0) {
          ctx.save();
          ctx.translate(2, bob * 0.5 + (eating ? Math.sin(t * 10) * 1.2 : Math.sin(phase) * 1.4));
          footballHelmet(ctx);
          ctx.restore();
        }
        break;
      case 'flag':
        flagPole(ctx, t);
        break;
      case 'pole':
        if (!z.hasVaulted && !z.anim.dying) vaultPole(ctx, z.anim.poleAngle);
        break;
    }

    /* —— 近侧手臂（最前层） —— */
    const armSwing2 = eating ? Math.sin(t * 10 + Math.PI) * 0.25 : Math.sin(phase) * 0.12;
    const reach = z.type === 'football' && !eating ? 0.9 : 1.25;
    limb(ctx, 4, -58 + bob * 0.5, 32, 9, reach - armSwing2, pal.shirt);
    ctx.save();
    const ax = 4 + Math.cos(reach - armSwing2) * 32;
    const ay = -58 + bob * 0.5 + Math.sin(reach - armSwing2) * 32;
    ctx.translate(ax, ay);
    ctx.fillStyle = pal.skin;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    /* 手指 */
    ctx.strokeStyle = pal.skinLine;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2, -3); ctx.lineTo(7, -5);
    ctx.moveTo(2, 0); ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();

    /* 报纸（手前） */
    if (z.type === 'news' && z.shieldHp > 0 && !dying) {
      newspaper(ctx);
    }

    ctx.restore();
  };

  /* 撑杆跳过程（空中姿态）单独绘制 */
  SZ.drawVaulting = (ctx, z) => {
    const pal = z.chill > 0 ? PAL.chilled : PAL.normal;
    const t = z.anim.t;
    ctx.save();
    ctx.rotate(-0.35 + Math.sin(t * 4) * 0.1);
    /* 蜷腿姿态 */
    limb(ctx, -2, -38, 34, 9, 0.7, pal.pants);
    limb(ctx, 3, -38, 34, 10, 0.95, pal.pants);
    const tg = ctx.createLinearGradient(-11, 0, 11, 0);
    tg.addColorStop(0, pal.shirt);
    tg.addColorStop(1, pal.shirtDark);
    ctx.fillStyle = tg;
    U.rr(ctx, -11, -64, 22, 30, 6);
    ctx.fill();
    ctx.save();
    ctx.translate(2, 0);
    head(ctx, { p: pal, tilt: 0.3, jaw: 0.3 });
    ctx.restore();
    limb(ctx, 4, -58, 32, 9, 1.9, pal.shirt);
    limb(ctx, -3, -60, 30, 8, 2.2, pal.shirtDark);
    ctx.restore();
  };

  PVZ.SZ = SZ;
})(window);
