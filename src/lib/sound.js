// "Reservation complete": a short three-note chime plus a spoken confirmation.
// Browsers only allow sound right after a click, so call unlockAudio() inside the click handler first.
let ctx = null;

export function unlockAudio() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ctx = ctx || new C();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio on this device */ }
}

function chime() {
  if (!ctx) return;
  const start = ctx.currentTime + 0.05;
  [523.25, 659.25, 783.99].forEach((freq, i) => { // C5, E5, G5
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const t = start + i * 0.16;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

// Female English voices that come with Windows, Edge, Chrome and Mac, best first.
const FEMALE = ['jenny', 'aria', 'zira', 'samantha', 'google us english', 'female', 'susan', 'hazel', 'karen', 'moira', 'tessa', 'victoria', 'libby', 'sonia', 'natasha'];

function femaleVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  for (const name of FEMALE) {
    const v = voices.find((x) => x.name.toLowerCase().includes(name));
    if (v) return v;
  }
  return null;
}
// The voice list loads after the page; ask for it early so it is ready by the first reservation.
try { window.speechSynthesis?.getVoices(); } catch { /* no voices */ }

function say(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    const v = femaleVoice();
    if (v) u.voice = v;
    u.pitch = v ? 1.1 : 1.4; // no female voice installed: raise the pitch of the default one
    setTimeout(() => window.speechSynthesis.speak(u), 550); // after the chime
  } catch { /* no voice on this device */ }
}

export function playReservationComplete() {
  try { chime(); } catch { /* ignore */ }
  say('Reservation complete');
}
