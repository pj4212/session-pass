import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
};

const pageTransition = {
  type: 'tween',
  ease: 'easeOut',
  duration: 0.18,
};

/**
 * Wrap route content with animated transitions.
 * Uses a simplified location key based on the first two path segments
 * so that sibling routes within the same layout animate properly.
 */
export default function AnimatedRoutes({ children }) {
  const location = useLocation();
  // Key on top-level path segment to avoid re-animating nested route changes
  const segments = location.pathname.split('/').filter(Boolean);
  const animationKey = segments.slice(0, 2).join('/') || '/';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={animationKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        style={{ minHeight: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}