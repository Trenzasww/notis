import { h } from './util.js';

const seg = new Intl.Segmenter('es', { granularity: 'grapheme' });
const split = s => [...seg.segment(s)].map(x => x.segment).filter(x => x.trim());

export const EMOJI = [
  ['😀', 'Caras', '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🫢🤫🤔🫡🤐🤨😐😑😶😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕😟🙁☹️😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👻👽🤖'],
  ['👍', 'Gestos', '👍👎👊✊🤛🤜👏🙌🫶👐🤲🤝🙏✌️🤞🫰🤟🤘👌🤌🤏👈👉👆👇☝️🫵✋🤚🖐️🖖👋🤙💪🦾🖕✍️🤳💅👀👁️👅👄🫦🧠🫀🫁🦷👂👃👶🧒👦👧🧑👨👩🧓👴👵🙋🙆🙅🤦🤷💁🙇🕺💃🏃🚶🧘'],
  ['❤️', 'Símbolos', '❤️🧡💛💚💙💜🖤🤍🤎💔❤️‍🔥❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☯️♈♉♊♋♌♍♎♏♐♑♒♓💯✅❌❎❗❓‼️⁉️⚠️🚫⭕🔴🟠🟡🟢🔵🟣⚫⚪🟤🔺🔻🔷🔶▶️⏸️⏹️⏺️⏭️🔁🔀🔔🔕🎵🎶➕➖➗✖️♾️💲™️©️®️✔️☑️🔝🔜🆕🆓🆗🆒🆙🔥⭐🌟✨💫⚡💥💢💤💬💭🗯️'],
  ['🐶', 'Animales', '🐶🐱🐭🐹🐰🦊🐻🐼🐻‍❄️🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🦟🐢🐍🦎🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🐈🐓🦃🦚🦜🦢🕊️🐇🦝🦨🦡🐁🐀🐿️🦔🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🍃🍂🍁🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌙⭐🌈☁️⛅🌧️⛈️❄️☃️🔥💧🌊'],
  ['🍔', 'Comida', '🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🧀🥚🍳🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🥗🥘🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛☕🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🍾🧊'],
  ['⚽', 'Actividad', '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🏑🥍🏏⛳🏹🎣🤿🥊🥋🎽🛹🛼⛸️🥌🎿⛷️🏂🏋️🤸🤼🤺⛹️🏌️🏇🧘🏄🏊🚴🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🕹️🎰🧩'],
  ['🚗', 'Viajes', '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🏍️🛵🚲🛴🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓⛽🚧🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏢🏬🏣🏥🏦🏨🏪🏫🏭🌆🌇🌃🌉'],
  ['💡', 'Objetos', '⌚📱💻⌨️🖥️🖨️🖱️💽💾💿📀📷📸📹🎥📞☎️📺📻🎙️⏰⏳📡🔋🔌💡🔦🕯️🧯💸💵💴💶💷💰💳🧾💎⚖️🧰🔧🔨⚒️🛠️⛏️🔩⚙️🧲🔫💣🧨🪓🔪🗡️🛡️🔮📿🧿💈⚗️🔭🔬🩺💊💉🧬🦠🧪🌡️🧹🧺🧻🚽🚿🛁🔑🗝️🚪🛋️🛏️🧸🖼️🛍️🎁🎈🎀🎊🎉🎎🏮✉️📩📦📫📪📝📁📂📅📆📇📈📉📊📋📌📍📎🖇️📏📐✂️🗃️🗄️🗑️🔒🔓📚📖🔖🏷️'],
  ['🏳️', 'Banderas', '🏳️🏴🏁🚩🏳️‍🌈🏳️‍⚧️🇦🇷🇧🇷🇺🇾🇨🇱🇵🇾🇧🇴🇵🇪🇨🇴🇻🇪🇪🇨🇲🇽🇺🇸🇨🇦🇪🇸🇫🇷🇮🇹🇩🇪🇵🇹🇬🇧🇯🇵🇰🇷🇨🇳🇮🇳🇷🇺🇦🇺🇿🇦🇪🇺']
].map(([i, n, s]) => ({ icon: i, name: n, list: split(s) }));

const RK = 'notis.emoji.recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RK) || '[]'); } catch { return []; } };
function remember(e) { try { localStorage.setItem(RK, JSON.stringify([e, ...recent().filter(x => x !== e)].slice(0, 32))); } catch {} }

export function emojiPicker(onPick) {
  const grid = h('div', { class: 'emoji-grid' });
  const tabs = h('div', { class: 'emoji-tabs' });
  const cats = [{ icon: '🕘', name: 'Recientes', list: recent() }, ...EMOJI];
  const show = i => {
    cats[0].list = recent();
    [...tabs.children].forEach((t, j) => t.classList.toggle('on', i === j));
    grid.replaceChildren(...(cats[i].list.length ? cats[i].list : ['Todavía no usaste emojis']).map(e =>
      e.length > 12 ? h('div', { class: 'mute pad' }, e) : h('button', { class: 'emo', onclick: () => { remember(e); onPick(e); } }, e)));
    grid.scrollTop = 0;
  };
  cats.forEach((c, i) => tabs.append(h('button', { class: 'emo-tab', title: c.name, onclick: () => show(i) }, c.icon)));
  const box = h('div', { class: 'emoji-pop glass' }, tabs, grid);
  show(recent().length ? 0 : 1);
  return box;
}
