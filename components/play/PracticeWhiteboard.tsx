'use client'

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { Editor, Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

const HIDDEN_UI = {
  ContextMenu: null,
  ActionsMenu: null,
  HelpMenu: null,
  ZoomMenu: null,
  MainMenu: null,
  Minimap: null,
  StylePanel: null,
  PageMenu: null,
  NavigationPanel: null,
  Toolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
} as const

type WhiteboardTool = 'draw' | 'eraser'

export type PracticeWhiteboardHandle = {
  clear: () => void
  exportImage: () => Promise<{ imageBase64: string; mimeType: 'image/png' } | null>
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export const PracticeWhiteboard = memo(
  forwardRef<PracticeWhiteboardHandle, { tool: WhiteboardTool }>(function PracticeWhiteboard(
    { tool },
    ref
  ) {
    const editorRef = useRef<Editor | null>(null)

    useEffect(() => {
      editorRef.current?.setCurrentTool(tool)
    }, [tool])

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          const editor = editorRef.current
          if (!editor) return

          const shapeIds = Array.from(editor.getCurrentPageShapeIds())
          if (shapeIds.length > 0) {
            editor.deleteShapes(shapeIds)
          }
        },
        async exportImage() {
          const editor = editorRef.current
          if (!editor) return null

          const shapeIds = Array.from(editor.getCurrentPageShapeIds())
          if (shapeIds.length === 0) return null

          const result = await editor.toImage(shapeIds, {
            format: 'png',
            background: true,
            scale: 1,
            padding: 32,
          })

          return {
            imageBase64: await blobToBase64(result.blob),
            mimeType: 'image/png' as const,
          }
        },
      }),
      []
    )

    return (
      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border">
        <Tldraw
          components={HIDDEN_UI}
          onMount={(editor) => {
            editorRef.current = editor
            editor.setCurrentTool(tool)
            editor.updateInstanceState({ isDebugMode: false })
          }}
        />
      </div>
    )
  })
)

PracticeWhiteboard.displayName = 'PracticeWhiteboard'
