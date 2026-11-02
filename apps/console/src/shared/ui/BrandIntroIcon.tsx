import { motion } from 'motion/react';
import { BRAND_DRAW_TRANSITION } from './BrandWordmark';
import { useAppReducedMotion } from '../../motionPreference';
const PATHS = [{"d": "M60 14.5C60 9.2 64.7 7.5 68.5 10.3L77.5 17C80.3 19 81 21.3 81 25V71.7C81 76.7 77.5 80.3 72.5 80.3H60V14.5Z", "fill": "url(#intro-icon-tower)"}, {"d": "M77.5 26L88.5 33.4C91.4 35.4 92 37.5 92 41V70.2C92 76.2 87.5 80.3 81.5 80.3H77.5V26Z", "fill": "url(#intro-icon-front)"}, {"d": "M6 45.2C6 41.2 7.7 38.4 11.4 35.4L41 11.3C44.5 8.45 47.4 8.45 50.7 11.1L64.6 22.35C71.8 28.2 74 32.8 74 40.4V70.5H61V44.7C61 41.7 60.4 40.4 58 38.5L47.7 29.9C46 28.5 44.9 28.6 43.3 29.9L23.8 46.1C21.8 47.8 21 49.4 21 52V80.3H14.4C9 80.3 6 77.4 6 72V45.2Z", "fill": "url(#intro-icon-roof)"}, {"d": "M21.4 68.8C29.4 63.2 39.1 62 49.5 64.7C59.6 67.3 70 74.9 79.5 77C83.5 77.9 87.5 77.8 92.7 74.7C87.9 84.5 76.5 88.5 65.8 85.9C50.9 82.3 37.7 70.9 21.4 68.8Z", "fill": "url(#intro-icon-flow)"}];
const WINDOWS = [{"x": "34.5", "y": "46", "width": "8.3", "height": "8.3", "rx": "2", "fill": "#0864E5"}, {"x": "45.1", "y": "46", "width": "8.3", "height": "8.3", "rx": "2", "fill": "#0864E5"}, {"x": "34.5", "y": "56.5", "width": "8.3", "height": "8.3", "rx": "2", "fill": "#0864E5"}, {"x": "45.1", "y": "56.5", "width": "8.3", "height": "8.3", "rx": "2", "fill": "#0864E5"}, {"x": "83.3", "y": "40.8", "width": "3.9", "height": "7.3", "rx": "1.95", "fill": "#F5FFFE"}, {"x": "83.3", "y": "52.2", "width": "3.9", "height": "7.3", "rx": "1.95", "fill": "#F5FFFE"}, {"x": "83.3", "y": "63.6", "width": "3.9", "height": "7.3", "rx": "1.95", "fill": "#F5FFFE"}];

export function BrandIntroIcon() {
  const reduced = useAppReducedMotion();
  const initial = reduced ? false : { pathLength: 0, fillOpacity: 0 };
  const transition = reduced ? { duration: 0 } : BRAND_DRAW_TRANSITION;
  return <svg viewBox="0 0 96 96" className="block h-full w-full overflow-visible" aria-hidden="true" data-testid="loading-icon-draw">
    <defs>
    <linearGradient id="intro-icon-roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#28B7FF"/><stop offset="0.44" stopColor="#0879FA"/><stop offset="1" stopColor="#0750D8"/></linearGradient>
    <linearGradient id="intro-icon-tower" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#16D2CB"/><stop offset="1" stopColor="#009B9F"/></linearGradient>
    <linearGradient id="intro-icon-front" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stopColor="#0CCBC4"/><stop offset="1" stopColor="#088C94"/></linearGradient>
    <linearGradient id="intro-icon-flow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0453D9"/><stop offset="0.42" stopColor="#058BF3"/><stop offset="1" stopColor="#09CDB8"/></linearGradient>
    </defs>
    {PATHS.map(({d, fill}, index) => <motion.path key={index} d={d} fill={fill} stroke="#0879FA" strokeWidth={0.65} strokeLinejoin="round" initial={initial} animate={{ pathLength: 1, fillOpacity: 1 }} transition={transition} />)}
    {WINDOWS.map((rect, index) => <motion.rect key={index} {...rect} stroke={rect.fill} strokeWidth={0.35} initial={initial} animate={{ pathLength: 1, fillOpacity: 1 }} transition={transition} />)}
  </svg>;
}
