import { isImageAvatar } from '@rol/shared';
import { avatarOf } from '../lib/format';

interface Props {
  name: string;
  avatar: string | null;
}

/** El avatar puesto: una imagen subida, un emoji, o si no hay nada la inicial del nombre. */
export default function Avatar({ name, avatar }: Props) {
  if (isImageAvatar(avatar)) return <img src={avatar} alt="" />;
  return <>{avatarOf(name, avatar)}</>;
}
