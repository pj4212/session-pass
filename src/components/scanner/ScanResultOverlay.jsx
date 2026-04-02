import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const COLORS = {
  success: { bg: 'bg-green-500', icon: CheckCircle2, dismiss: 2000 },
  warning: { bg: 'bg-yellow-500', icon: AlertTriangle, dismiss: 3000 },
  error: { bg: 'bg-red-500', icon: XCircle, dismiss: 3000 },
};

export default function ScanResultOverlay({ result, onDismiss }) {
  const config = COLORS[result.type] || COLORS.error;
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(onDismiss, config.dismiss);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${config.bg} text-white p-8`}
      onClick={onDismiss}
    >
      <Icon className="h-24 w-24 mb-6" />
      <p className="text-2xl font-bold text-center mb-2">{result.title}</p>
      {result.subtitle && <p className="text-lg text-center opacity-90">{result.subtitle}</p>}
    </div>
  );
}