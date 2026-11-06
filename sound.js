/* =========================================================
   MOVA AR · Sons generats amb la Web Audio API
   (no cal carregar cap fitxer d'àudio extern)
   ========================================================= */
const Sound = (() => {
  let ctx = null;

  // El navegador només deixa crear l'àudio després d'un clic de l'usuari
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function tone(freq, start, dur, type = "sine", vol = 0.25, endFreq = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // So curt i alegre quan s'atrapa un cor
  function pop() {
    tone(660, 0, 0.12, "triangle", 0.22, 990);
    tone(990, 0.07, 0.14, "sine", 0.15, 1320);
  }

  // "Bip" del compte enrere 3-2-1 (el darrer més agut)
  function beep(last = false) {
    tone(last ? 880 : 520, 0, last ? 0.35 : 0.18, "square", 0.12);
  }

  // Xiulet d'àrbitre al final de l'exercici
  function whistle() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [0, 0.42].forEach((offset, i) => {
      const dur = i === 0 ? 0.32 : 0.75;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();      // trèmolo típic del xiulet
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 2900;
      lfo.frequency.value = 38;
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + offset + 0.03);
      gain.gain.setValueAtTime(0.3, t0 + offset + dur - 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset); lfo.start(t0 + offset);
      osc.stop(t0 + offset + dur + 0.05); lfo.stop(t0 + offset + dur + 0.05);
    });
  }

  return { unlock, pop, beep, whistle };
})();
