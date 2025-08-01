import type { Attachment, UIMessage } from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from '../message/multimodal-input';
import { Toolbar } from '../layout/toolbar';
import { VersionFooter } from '../layout/version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from '../ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { imageArtifact } from '@/artifacts/image/client';
import { sheetArtifact } from '@/artifacts/sheet/client';
import { textArtifact } from '@/artifacts/text/client';
import { memoryArtifact } from '@/artifacts/memory/client';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from '@/components/message/visibility-selector';

export interface ArtifactContentProps {
  content: any;
  mode?: 'edit' | 'diff';
  status?: string;
  currentVersionIndex?: number;
  suggestions?: any[];
  onSaveContent?: (content: string, debounce: boolean) => void;
  isInline?: boolean;
  isCurrentVersion?: boolean;
  getDocumentContentById?: (index: number) => string;
  isLoading?: boolean;
  metadata?: any;
  setMetadata?: (metadata: any) => void;
  language?: string;
}

export const artifactDefinitions = [
  textArtifact,
  imageArtifact,
  sheetArtifact,
  memoryArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]['kind'];

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string | null;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  language?: string;
}

function PureArtifact({
  chatId,
  input,
  setInput,
  handleSubmit,
  status,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
  selectedModelId,
  selectedVisibilityType,
}: {
  chatId: string;
  input: string;
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: UseChatHelpers['stop'];
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  votes: Array<Vote> | undefined;
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  // Handle chat stop - ensure artifact status is updated when chat is stopped
  useEffect(() => {
    if (status !== 'streaming' && artifact.status === 'streaming') {
      console.log('[ARTIFACT] Chat stopped, updating artifact status to idle');
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        status: 'idle',
      }));
    }
  }, [status, artifact.status, setArtifact]);

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' && artifact.status !== 'streaming'
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher,
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  const { open: isSidebarOpen } = useSidebar();

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => {
          console.log('[ARTIFACT COMPONENT] Setting content from document:', {
            documentId: mostRecentDocument.id,
            contentLength: mostRecentDocument.content?.length || 0,
            preview: mostRecentDocument.content?.substring(0, 30) || 'empty',
            currentArtifactKind: currentArtifact.kind,
            currentArtifactVisible: currentArtifact.isVisible,
          });
          return {
            ...currentArtifact,
            content: mostRecentDocument.content ?? '',
          };
        });
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact || !artifact.documentId || artifact.documentId === 'init') {
        console.log('Cannot update document: invalid artifact state');
        return;
      }

      console.log('Handling content change:', {
        documentId: artifact.documentId,
        contentLength: updatedContent?.length || 0,
        preview: updatedContent?.substring?.(0, 30) || '',
      });

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments) return undefined;

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument) {
            console.log('No current document found, creating new one');
            setIsContentDirty(false);
            return currentDocuments;
          }

          // Only update if content has actually changed
          if (currentDocument.content !== updatedContent) {
            console.log('Content changed, sending update request');

            const response = await fetch(
              `/api/document?id=${artifact.documentId}`,
              {
                method: 'POST',
                body: JSON.stringify({
                  title: artifact.title,
                  content: updatedContent,
                  kind: artifact.kind,
                }),
              },
            );

            if (!response.ok) {
              console.error(
                'Failed to update document:',
                await response.text(),
              );
              return currentDocuments;
            }

            setIsContentDirty(false);
            console.log('Document updated successfully');

            // Fetch the updated documents instead of using getDocumentsById
            const updatedResponse = await fetch(
              `/api/document?id=${artifact.documentId}`,
            );
            if (updatedResponse.ok) {
              return await updatedResponse.json();
            }
            return currentDocuments;
          } else {
            console.log('Content unchanged, skipping update');
            return currentDocuments;
          }
        },
        { revalidate: true },
      );
    },
    [artifact, mutate],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (document && updatedContent !== document.content) {
        setIsContentDirty(true);

        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) {
      console.log('[ARTIFACT] No documents available for version control');
      return;
    }

    console.log('[ARTIFACT] Version change requested:', {
      type,
      documentId: artifact.documentId,
      currentIndex: currentVersionIndex,
      totalVersions: documents.length,
    });

    try {
      if (type === 'latest') {
        if (documents.length === 0) {
          console.log('[ARTIFACT] No versions available to navigate to');
          return;
        }

        const latestIndex = documents.length - 1;
        console.log('[ARTIFACT] Setting to latest version:', latestIndex);
        setCurrentVersionIndex(latestIndex);
        setMode('edit');

        // Update artifact content with the latest document
        const latestDoc = documents[latestIndex];
        if (latestDoc?.content) {
          console.log('[ARTIFACT] Updating content with latest version', {
            contentLength: latestDoc.content.length,
            timestamp: latestDoc.createdAt,
          });

          setArtifact((current) => ({
            ...current,
            content: latestDoc.content || '',
            status: 'idle',
          }));
        } else {
          console.error('[ARTIFACT] Latest document has no content');
        }
        return;
      }

      if (type === 'toggle') {
        const newMode = mode === 'edit' ? 'diff' : 'edit';
        console.log('[ARTIFACT] Toggling mode from', mode, 'to', newMode);
        setMode(newMode);
        return;
      }

      if (type === 'prev') {
        if (currentVersionIndex > 0) {
          const newIndex = currentVersionIndex - 1;
          console.log('[ARTIFACT] Moving to previous version:', newIndex);
          setCurrentVersionIndex(newIndex);

          // Update artifact content with the selected document
          const selectedDoc = documents[newIndex];
          if (selectedDoc?.content) {
            console.log('[ARTIFACT] Updated content with previous version', {
              index: newIndex,
              contentLength: selectedDoc.content.length,
              timestamp: selectedDoc.createdAt,
            });

            setArtifact((current) => ({
              ...current,
              content: selectedDoc.content || '',
              status: 'idle',
            }));
          } else {
            console.error('[ARTIFACT] Selected document has no content');
          }
        } else {
          console.log(
            '[ARTIFACT] Already at oldest version, cannot go back further',
          );
        }
        return;
      }

      if (type === 'next') {
        if (currentVersionIndex < documents.length - 1) {
          const newIndex = currentVersionIndex + 1;
          console.log('[ARTIFACT] Moving to next version:', newIndex);
          setCurrentVersionIndex(newIndex);

          // Update artifact content with the selected document
          const selectedDoc = documents[newIndex];
          if (selectedDoc?.content) {
            console.log('[ARTIFACT] Updated content with next version', {
              index: newIndex,
              contentLength: selectedDoc.content.length,
              timestamp: selectedDoc.createdAt,
            });

            setArtifact((current) => ({
              ...current,
              content: selectedDoc.content || '',
              status: 'idle',
            }));
          } else {
            console.error('[ARTIFACT] Selected document has no content');
          }
        } else {
          console.log(
            '[ARTIFACT] Already at latest version, cannot go forward',
          );
        }
        return;
      }
    } catch (error) {
      console.error('[ARTIFACT] Error during version change:', error);
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  useEffect(() => {
    if (artifact.documentId !== 'init') {
      if (artifactDefinition.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
          setArtifact,
        });
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <motion.div
          data-testid="artifact"
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-transparent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.4 } }}
        >
          {!isMobile && (
            <motion.div
              className="fixed bg-background h-dvh"
              initial={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
              animate={{ width: windowWidth, right: 0 }}
              exit={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
            />
          )}

          {!isMobile && (
            <motion.div
              className="fixed w-[400px] bg-muted dark:bg-background h-dvh shrink-0"
              initial={{ opacity: 0, x: windowWidth, scale: 1 }}
              animate={{
                opacity: 1,
                x: windowWidth - 400,
                scale: 1,
                transition: {
                  delay: 0.2,
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                },
              }}
              exit={{
                opacity: 0,
                x: windowWidth,
                scale: 1,
                transition: { duration: 0 },
              }}
            >
              <AnimatePresence>
                {!isCurrentVersion && (
                  <motion.div
                    className="left-0 absolute h-dvh w-[400px] top-0 bg-zinc-900/50 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              <div className="flex flex-col h-full justify-between items-center">
                <ArtifactMessages
                  chatId={chatId}
                  status={status}
                  votes={votes}
                  messages={messages}
                  setMessages={setMessages}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                  selectedModelId={selectedModelId}
                />

                <form className="flex flex-row gap-2 relative items-end w-[95%] mx-auto px-4 pb-4">
                  <MultimodalInput
                    chatId={chatId}
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    status={status}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    append={append}
                    className="bg-background dark:bg-muted"
                    setMessages={setMessages}
                    selectedModelId={selectedModelId}
                    selectedVisibilityType={selectedVisibilityType}
                  />
                </form>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed dark:bg-muted bg-background h-dvh flex flex-col overflow-y-scroll md:border-r dark:border-zinc-700 border-zinc-200 w-full"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth : 'calc(100dvw)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
                : {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth
                      ? windowWidth - 400
                      : 'calc(100dvw-400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: {
                delay: 0.1,
                type: 'spring',
                stiffness: 600,
                damping: 30,
              },
            }}
          >
            <div className="p-2 flex flex-row justify-between items-start w-full">
              <div className="w-full mx-auto flex flex-row justify-between items-start">
                <div className="flex flex-row gap-4 items-start">
                  <ArtifactCloseButton />

                  <div className="flex flex-col">
                    <div className="font-medium">{artifact.title}</div>

                    {isContentDirty ? (
                      <div className="text-sm text-muted-foreground">
                        Saving changes...
                      </div>
                    ) : document ? (
                      <div className="text-sm text-muted-foreground">
                        {`Updated ${formatDistance(
                          new Date(document.createdAt),
                          new Date(),
                          {
                            addSuffix: true,
                          },
                        )}`}
                      </div>
                    ) : (
                      <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                    )}
                  </div>
                </div>

                <ArtifactActions
                  artifact={artifact}
                  currentVersionIndex={currentVersionIndex}
                  handleVersionChange={handleVersionChange}
                  isCurrentVersion={isCurrentVersion}
                  mode={mode}
                  metadata={metadata}
                  setMetadata={setMetadata}
                  appendMessage={append}
                />
              </div>
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              <artifactDefinition.content
                title={artifact.title}
                content={
                  isCurrentVersion
                    ? artifact.content
                    : getDocumentContentById(currentVersionIndex)
                }
                mode={mode}
                status={artifact.status}
                currentVersionIndex={currentVersionIndex}
                suggestions={[]}
                onSaveContent={saveContent}
                isInline={false}
                isCurrentVersion={isCurrentVersion}
                getDocumentContentById={getDocumentContentById}
                isLoading={isDocumentsFetching && !artifact.content}
                metadata={metadata}
                setMetadata={setMetadata}
                language={artifact.language}
              />

              <AnimatePresence>
                {isCurrentVersion && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    status={status}
                    stop={stop}
                    setMessages={setMessages}
                    artifactKind={artifact.kind}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages.length)) return false;
  if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) return false;

  return true;
});
