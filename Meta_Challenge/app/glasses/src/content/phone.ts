import type {Chapter} from '../content';

export const PHONE_LAYERS: {answer: string; chapter: Chapter} = {
  answer: 'About nine thin layers: glass, touch, pixels, chips and a battery.',
  chapter: {
    scene: 'phone-exploded',
    title: 'Layers',
    hint: 'Left/right: rotate. Up/down: tilt.',
    captions: [
      'A phone is a sandwich of about nine thin layers, all packed into less than a centimetre.',
      'The touch sensor is a grid of electrodes. Your finger changes the electric field, or capacitance, where you touch.',
      'Millions of OLED pixels each make their own light. A black pixel is simply off, which saves power on dark screens.',
      'The logic board holds processor, memory and radio chips. The processor does billions of simple steps per second.',
      'Lithium ions move between two electrode layers as you charge and use the phone. The battery is the largest part inside.',
      'The coil charges without a cable by magnetic induction. The camera stacks several lenses onto a tiny sensor.',
    ],
  },
};
