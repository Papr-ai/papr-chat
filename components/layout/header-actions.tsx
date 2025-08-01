'use client';

import { usePathname, useRouter } from 'next/navigation';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@/components/common/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function HeaderActions() {
  const router = useRouter();
  const pathname = usePathname();
  
  // Determine if we're on a chat page
  const isChatPage = pathname?.includes('/chat/');
  
  return (
    <div className="flex items-center gap-2">
      <SidebarToggle />    
    </div>
  );
} 