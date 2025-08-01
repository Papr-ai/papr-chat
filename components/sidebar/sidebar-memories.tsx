import {
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from '@/components/ui/sidebar';
import { FileIcon, BoxIcon } from '@/components/common/icons';
import type { User } from 'next-auth';
import Link from 'next/link';

export function SidebarMemories({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();

  if (!user) {
    return null;
  }

  return (
    <SidebarGroup className="mb-2">
      <div className="px-2 py-1 text-sm font-medium">Memories</div>
      <SidebarGroupContent>
        <div className="space-y-1">
          <Link
            href="/memories/collections"
            className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md"
          >
            <BoxIcon size={16} />
            <span>Collections</span>
          </Link>

          <Link
            href="/memories/pages"
            className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md"
          >
            <FileIcon size={16} />
            <span>Artifacts</span>
          </Link>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
