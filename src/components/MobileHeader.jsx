import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MobileHeader({ title, backTo, onBack, rightContent }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border safe-area-top">
      <div className="flex items-center h-12 px-2 gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="touch-target shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold truncate flex-1">{title}</h1>
        {rightContent && <div className="shrink-0">{rightContent}</div>}
      </div>
    </header>
  );
}