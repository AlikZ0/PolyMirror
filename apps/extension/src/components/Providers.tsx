import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../services/queryClient';
import { useBackgroundBridge } from '../hooks/useBackgroundBridge';

function Bridge({ children }: { children: ReactNode }) {
  useBackgroundBridge();
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <Bridge>{children}</Bridge>
    </QueryClientProvider>
  );
}
