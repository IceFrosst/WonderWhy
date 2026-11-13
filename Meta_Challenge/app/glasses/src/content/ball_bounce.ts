import type {Chapter} from '../content';

export const BALL_BOUNCE: Chapter = {
  scene: 'bounce',
  title: 'Bounce',
  lead: 'Each bounce keeps only part of the energy.',
  hint: 'Left/right: ball type. Up/down: drop height.',
  captions: [
    'Each bounce is lower because the ball keeps only part of its energy: the height ratio is e squared.',
    'Falling turns height energy into movement; the squash stores it like a spring; some is lost as heat and sound every bounce.',
    'Bounciness depends on the material: a super ball springs back almost fully, clay absorbs the energy as heat and barely bounces.',
  ],
};
