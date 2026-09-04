import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import * as store from '../src/store.js';
import { AppError, type Game, type Member } from '../src/types.js';

function setup() {
  const game = store.createGame('La Caida de Vhalgar');
  const join = (role: 'dm' | 'player' | 'voyeur', name: string): Member =>
    store.joinGame(game.codes[role], name).member;
  return { game, join };
}

beforeEach(() => store.reset());

describe('creacion de partida', () => {
  it('genera un codigo distinto por rol', () => {
    const { game } = setup();
    const codes = [game.codes.dm, game.codes.player, game.codes.voyeur];
    expect(new Set(codes).size).toBe(3);
    expect(game.codes.dm.startsWith('DM-')).toBe(true);
    expect(game.codes.player.startsWith('PJ-')).toBe(true);
    expect(game.codes.voyeur.startsWith('VY-')).toBe(true);
  });

  it('crea el canal general', () => {
    const { game } = setup();
    expect(game.channels[game.generalChannelId]?.type).toBe('general');
  });
});

describe('union con codigo', () => {
  it('asigna el rol segun el codigo usado', () => {
    const { join } = setup();
    expect(join('dm', 'Master').role).toBe('dm');
    expect(join('player', 'Kaelen').role).toBe('player');
    expect(join('voyeur', 'Sombra').role).toBe('voyeur');
  });

  it('acepta el codigo en minusculas y con espacios', () => {
    const { game } = setup();
    const member = store.joinGame(`  ${game.codes.player.toLowerCase()} `, 'Kaelen').member;
    expect(member.role).toBe('player');
  });

  it('rechaza un codigo inventado', () => {
    setup();
    expect(() => store.joinGame('PJ-XXXXXX', 'Nadie')).toThrow(AppError);
  });

  it('no permite dos nombres conectados iguales ni dos DM', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    kaelen.online = true;
    expect(() => store.joinGame(game.codes.player, 'kaelen')).toThrow(/conectado con ese nombre/i);
    join('dm', 'Master');
    expect(() => store.joinGame(game.codes.dm, 'Otro')).toThrow(/ya tiene un DM/i);
  });
});

describe('volver a entrar', () => {
  it('recupera el sitio y los chats de quien se fue', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    const brissa = join('player', 'Brissa');
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });

    // Kaelen se va: su sesion muere pero sigue siendo miembro.
    const back = store.joinGame(game.codes.player, 'kaelen');
    expect(back.member.id).toBe(kaelen.id);
    expect(store.canSeeChannel(back.member, channel)).toBe(true);
    expect(Object.values(game.members).filter((m) => !m.kicked)).toHaveLength(2);
  });

  it('invalida el token anterior al recuperar el nombre', () => {
    const { game, join } = setup();
    join('player', 'Kaelen');
    const first = store.joinGame(game.codes.player, 'Brissa').token;
    const second = store.joinGame(game.codes.player, 'Brissa').token;
    expect(second).not.toBe(first);
    expect(() => store.resumeSession(first)).toThrow(/no valida/i);
    expect(store.resumeSession(second).member.name).toBe('Brissa');
  });

  it('el DM que se fue vuelve con su nombre', () => {
    const { game, join } = setup();
    const master = join('dm', 'Master');
    expect(store.joinGame(game.codes.dm, 'Master').member.id).toBe(master.id);
  });

  it('no deja recuperar un nombre con un codigo de otro rol', () => {
    const { game, join } = setup();
    join('player', 'Kaelen');
    expect(() => store.joinGame(game.codes.voyeur, 'Kaelen')).toThrow(/otro rol/i);
  });

  it('un expulsado no recupera su nombre: entra como alguien nuevo', () => {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    store.kickMember(game, dm, kaelen.id);
    const again = store.joinGame(game.codes.player, 'Kaelen').member;
    expect(again.id).not.toBe(kaelen.id);
  });
});

describe('panel de administracion', () => {
  it('lista las partidas con sus participantes y su actividad', () => {
    const { game, join } = setup();
    join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    store.postMessage(game, kaelen, game.generalChannelId, 'Abro la puerta.');

    const [summary] = store.listGames().map(store.projectAdminGame);
    expect(summary?.name).toBe('La Caida de Vhalgar');
    expect(summary?.members.map((m) => m.name)).toEqual(['Master', 'Kaelen']);
    expect(summary?.codes.player).toBe(game.codes.player);
    expect(summary?.messageCount).toBeGreaterThan(0);
    expect(summary?.lastActivity).toBeGreaterThanOrEqual(summary!.createdAt);
  });

  it('borrar una partida invalida sus codigos y sus sesiones', () => {
    const { game, join } = setup();
    join('player', 'Kaelen');
    const token = store.joinGame(game.codes.player, 'Brissa').token;

    store.deleteGame(game.id);

    expect(store.listGames()).toHaveLength(0);
    expect(() => store.getGame(game.id)).toThrow(/ya no existe/i);
    expect(() => store.joinGame(game.codes.player, 'Otro')).toThrow(/no corresponde/i);
    expect(() => store.resumeSession(token)).toThrow(/no valida/i);
  });

  it('el codigo de invitacion llega al DM y a los jugadores, no al voyerista', () => {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    const sombra = join('voyeur', 'Sombra');

    expect(store.projectState(game, dm).game.inviteCode).toBe(game.codes.player);
    expect(store.projectState(game, kaelen).game.inviteCode).toBe(game.codes.player);
    expect(store.projectState(game, sombra).game.inviteCode).toBeUndefined();
    expect(store.projectState(game, kaelen).game.codes).toBeUndefined();
  });
});

describe('visibilidad de participantes', () => {
  it('los jugadores no ven a los voyeristas', () => {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const player = join('player', 'Kaelen');
    join('voyeur', 'Sombra');

    const seenByPlayer = store.visibleMembers(game, player).map((m) => m.name);
    expect(seenByPlayer).toContain('Master');
    expect(seenByPlayer).toContain('Kaelen');
    expect(seenByPlayer).not.toContain('Sombra');

    expect(store.visibleMembers(game, dm).map((m) => m.name)).toContain('Sombra');
  });

  it('el aviso de entrada de un voyerista no llega a los jugadores', () => {
    const { game, join } = setup();
    const player = join('player', 'Kaelen');
    const dm = join('dm', 'Master');
    join('voyeur', 'Sombra');

    const forPlayer = store.messagesFor(game, player, game.generalChannelId);
    const forDm = store.messagesFor(game, dm, game.generalChannelId);
    expect(forPlayer.some((m) => m.body.includes('Sombra'))).toBe(false);
    expect(forDm.some((m) => m.body.includes('Sombra'))).toBe(true);
  });
});

describe('canales', () => {
  function scenario() {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    const brissa = join('player', 'Brissa');
    const tercero = join('player', 'Tercero');
    const voyeur = join('voyeur', 'Sombra');
    return { game, dm, kaelen, brissa, tercero, voyeur };
  }

  it('un chat privado solo lo ven sus dos jugadores, el DM y el voyerista', () => {
    const { game, dm, kaelen, brissa, tercero, voyeur } = scenario();
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });

    expect(store.canSeeChannel(kaelen, channel)).toBe(true);
    expect(store.canSeeChannel(brissa, channel)).toBe(true);
    expect(store.canSeeChannel(tercero, channel)).toBe(false);
    expect(store.canSeeChannel(dm, channel)).toBe(true);
    expect(store.canSeeChannel(voyeur, channel)).toBe(true);
  });

  it('marca como observado el chat en el que el DM no participa', () => {
    const { game, dm, kaelen, brissa } = scenario();
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });
    expect(store.projectChannel(game, dm, channel).watching).toBe(true);
    expect(store.projectChannel(game, kaelen, channel).watching).toBe(false);
  });

  it('reutiliza el chat directo si ya existe', () => {
    const { game, kaelen, brissa } = scenario();
    const first = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });
    const second = store.createChannel(game, brissa, { kind: 'direct', memberIds: [kaelen.id] });
    expect(second.created).toBe(false);
    expect(second.channel.id).toBe(first.channel.id);
  });

  it('un grupo incluye a su creador', () => {
    const { game, kaelen, brissa, tercero } = scenario();
    const { channel } = store.createChannel(game, kaelen, {
      kind: 'group',
      name: 'Los que susurran',
      memberIds: [brissa.id, tercero.id],
    });
    expect(channel.memberIds).toHaveLength(3);
    expect(channel.memberIds).toContain(kaelen.id);
  });

  it('el voyerista no puede crear canales y nadie puede meterlo en uno', () => {
    const { game, kaelen, voyeur } = scenario();
    expect(() => store.createChannel(game, voyeur, { kind: 'direct', memberIds: [kaelen.id] })).toThrow(
      /solo puedes leer/i,
    );
    expect(() => store.createChannel(game, kaelen, { kind: 'direct', memberIds: [voyeur.id] })).toThrow(
      AppError,
    );
  });
});

describe('mensajes', () => {
  function chatScenario() {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    const brissa = join('player', 'Brissa');
    const voyeur = join('voyeur', 'Sombra');
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });
    return { game, dm, kaelen, brissa, voyeur, channel };
  }

  it('el voyerista no puede escribir en ningun sitio', () => {
    const { game, voyeur, channel } = chatScenario();
    expect(() => store.postMessage(game, voyeur, game.generalChannelId, 'hola')).toThrow(/solo puedes leer/i);
    expect(() => store.postMessage(game, voyeur, channel.id, 'hola')).toThrow(/solo puedes leer/i);
  });

  it('el DM puede escribir en un chat privado ajeno', () => {
    const { game, dm, channel } = chatScenario();
    const { message } = store.postMessage(game, dm, channel.id, 'Escucho pasos tras vosotros.');
    expect(message.authorRole).toBe('dm');
  });

  it('un jugador ajeno al chat no puede escribir en el', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    const brissa = join('player', 'Brissa');
    const tercero = join('player', 'Tercero');
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });
    expect(() => store.postMessage(game, tercero, channel.id, 'os leo')).toThrow(AppError);
  });

  it('rechaza mensajes vacios o demasiado largos', () => {
    const { game, kaelen } = chatScenario();
    expect(() => store.postMessage(game, kaelen, game.generalChannelId, '   ')).toThrow(/vacio/i);
    expect(() => store.postMessage(game, kaelen, game.generalChannelId, 'x'.repeat(2001))).toThrow(/2000/);
  });

  it('el DM borra cualquier mensaje y el autor el suyo', () => {
    const { game, dm, kaelen, brissa } = chatScenario();
    const a = store.postMessage(game, kaelen, game.generalChannelId, 'primero').message;
    const b = store.postMessage(game, brissa, game.generalChannelId, 'segundo').message;

    expect(() => store.deleteMessage(game, kaelen, b.id)).toThrow(/solo el DM/i);
    expect(store.deleteMessage(game, kaelen, a.id).message.deletedBy).toBe('author');
    expect(store.deleteMessage(game, dm, b.id).message.deletedBy).toBe('dm');
    expect(store.projectMessage(b).body).toBe('');
  });

  it('el voyerista no puede borrar', () => {
    const { game, kaelen, voyeur } = chatScenario();
    const msg = store.postMessage(game, kaelen, game.generalChannelId, 'hola').message;
    expect(() => store.deleteMessage(game, voyeur, msg.id)).toThrow(/solo puedes leer/i);
  });

  it('guarda una foto y sirve su fichero', () => {
    const url = store.saveChatImage(Buffer.from('foto-falsa'), 'image/jpeg');
    expect(url).toMatch(/^\/uploads\/.+\.jpg$/);
    const filePath = path.join(store.CHAT_IMAGE_DIR, url.replace('/uploads/', ''));
    expect(fs.readFileSync(filePath, 'utf8')).toBe('foto-falsa');
  });

  it('una imagen sin pie de foto es un mensaje valido', () => {
    const { game, kaelen } = chatScenario();
    const url = store.saveChatImage(Buffer.from('foto'), 'image/png');
    const { message } = store.postMessage(game, kaelen, game.generalChannelId, '', url);
    expect(message.image).toBe(url);
    expect(message.body).toBe('');
  });

  it('rechaza un mensaje sin texto ni imagen', () => {
    const { game, kaelen } = chatScenario();
    expect(() => store.postMessage(game, kaelen, game.generalChannelId, '   ', undefined)).toThrow(/vacio/i);
  });

  it('rechaza una imagen que no hayamos guardado nosotros', () => {
    const { game, kaelen } = chatScenario();
    expect(() =>
      store.postMessage(game, kaelen, game.generalChannelId, '', '/uploads/inventada.png'),
    ).toThrow(/no esta disponible|invalida/i);
    expect(() =>
      store.postMessage(game, kaelen, game.generalChannelId, '', 'https://otra-web.com/x.png'),
    ).toThrow(/invalida/i);
  });

  it('al borrar un mensaje tambien se quita la imagen', () => {
    const { game, kaelen } = chatScenario();
    const url = store.saveChatImage(Buffer.from('foto'), 'image/png');
    const { message } = store.postMessage(game, kaelen, game.generalChannelId, 'mira esto', url);
    store.deleteMessage(game, kaelen, message.id);
    expect(store.projectMessage(message).image).toBeNull();
  });
});

describe('perfil', () => {
  it('pone y quita el avatar', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');

    store.setAvatar(game, kaelen, ' 🧙 ');
    expect(kaelen.avatar).toBe('🧙');

    store.setAvatar(game, kaelen, '  ');
    expect(kaelen.avatar).toBeNull();
  });

  it('rechaza un avatar demasiado largo', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    expect(() => store.setAvatar(game, kaelen, 'x'.repeat(9))).toThrow(/avatar/i);
  });

  it('guarda una imagen subida como avatar y sirve su fichero', () => {
    const { join } = setup();
    const kaelen = join('player', 'Kaelen');

    store.saveAvatarImage(kaelen, Buffer.from('contenido-falso'), 'image/png');
    expect(kaelen.avatar).toMatch(/^\/avatars\/.+\.png$/);
    const filePath = path.join(store.AVATAR_DIR, kaelen.avatar!.replace('/avatars/', ''));
    expect(fs.readFileSync(filePath, 'utf8')).toBe('contenido-falso');
  });

  it('rechaza un formato de imagen no admitido', () => {
    const { join } = setup();
    const kaelen = join('player', 'Kaelen');
    expect(() => store.saveAvatarImage(kaelen, Buffer.from('x'), 'image/svg+xml')).toThrow(/solo se admiten/i);
  });

  it('borra el fichero anterior al subir otra imagen o volver a un emoji', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');

    store.saveAvatarImage(kaelen, Buffer.from('primera'), 'image/png');
    const firstPath = path.join(store.AVATAR_DIR, kaelen.avatar!.replace('/avatars/', ''));
    expect(fs.existsSync(firstPath)).toBe(true);

    store.saveAvatarImage(kaelen, Buffer.from('segunda'), 'image/png');
    expect(fs.existsSync(firstPath)).toBe(false);
    const secondPath = path.join(store.AVATAR_DIR, kaelen.avatar!.replace('/avatars/', ''));
    expect(fs.existsSync(secondPath)).toBe(true);

    store.setAvatar(game, kaelen, '🧙');
    expect(fs.existsSync(secondPath)).toBe(false);
    expect(kaelen.avatar).toBe('🧙');
  });

  it('un mensaje conserva el avatar de cuando se escribio, aunque luego cambie', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    store.setAvatar(game, kaelen, '🧙');

    const { message } = store.postMessage(game, kaelen, game.generalChannelId, 'hola');
    expect(message.authorAvatar).toBe('🧙');

    store.setAvatar(game, kaelen, '🐺');
    expect(message.authorAvatar).toBe('🧙');
  });

  it('cambia el nombre si esta libre', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    store.renameMember(game, kaelen, ' Kael ');
    expect(kaelen.name).toBe('Kael');
  });

  it('no permite dos nombres iguales a la vez, ignorando mayusculas', () => {
    const { game, join } = setup();
    const kaelen = join('player', 'Kaelen');
    join('player', 'Brissa');
    expect(() => store.renameMember(game, kaelen, 'brissa')).toThrow(/ya lo usa alguien/i);
  });

  it('deja recuperar el nombre de alguien expulsado', () => {
    const { game, join } = setup();
    const dm = join('dm', 'Master');
    const kaelen = join('player', 'Kaelen');
    const brissa = join('player', 'Brissa');
    store.kickMember(game, dm, brissa.id);
    expect(() => store.renameMember(game, kaelen, 'Brissa')).not.toThrow();
  });
});

describe('expulsiones', () => {
  it('el DM expulsa y la sesion deja de valer', () => {
    const game = store.createGame('Partida');
    const dm = store.joinGame(game.codes.dm, 'Master').member;
    const joined = store.joinGame(game.codes.player, 'Kaelen');

    store.kickMember(game, dm, joined.member.id);
    expect(game.members[joined.member.id]?.kicked).toBe(true);
    expect(() => store.resumeSession(joined.token)).toThrow(AppError);
    expect(store.visibleMembers(game, dm).map((m) => m.name)).not.toContain('Kaelen');
  });

  it('un jugador no puede expulsar', () => {
    const game = store.createGame('Partida');
    const kaelen = store.joinGame(game.codes.player, 'Kaelen').member;
    const brissa = store.joinGame(game.codes.player, 'Brissa').member;
    expect(() => store.kickMember(game, kaelen, brissa.id)).toThrow(/solo el DM/i);
  });

  it('saca al expulsado de sus canales', () => {
    const game = store.createGame('Partida');
    const dm = store.joinGame(game.codes.dm, 'Master').member;
    const kaelen = store.joinGame(game.codes.player, 'Kaelen').member;
    const brissa = store.joinGame(game.codes.player, 'Brissa').member;
    const { channel } = store.createChannel(game, kaelen, { kind: 'direct', memberIds: [brissa.id] });

    store.kickMember(game, dm, brissa.id);
    expect(channel.memberIds).not.toContain(brissa.id);
  });
});

describe('proyeccion de estado', () => {
  it('solo el DM recibe los codigos de la partida', () => {
    const game: Game = store.createGame('Partida');
    const dm = store.joinGame(game.codes.dm, 'Master').member;
    const player = store.joinGame(game.codes.player, 'Kaelen').member;
    const voyeur = store.joinGame(game.codes.voyeur, 'Sombra').member;

    expect(store.projectState(game, dm).game.codes).toEqual(game.codes);
    expect(store.projectState(game, player).game.codes).toBeUndefined();
    expect(store.projectState(game, voyeur).game.codes).toBeUndefined();
  });

  it('describe los permisos de cada rol', () => {
    const game = store.createGame('Partida');
    const dm = store.joinGame(game.codes.dm, 'Master').member;
    const voyeur = store.joinGame(game.codes.voyeur, 'Sombra').member;

    expect(store.projectState(game, dm).me).toMatchObject({ canKick: true, canCreateChannels: true });
    expect(store.projectState(game, voyeur).me).toMatchObject({ canKick: false, canCreateChannels: false });
  });
});
