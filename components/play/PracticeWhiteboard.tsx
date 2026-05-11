'use client'

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { createShapeId, Editor, TLShapeId, Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import type { StrokeAnnotation } from '@/lib/gemini'

const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY?.trim() || undefined

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

const CIRCLE_RADIUS = 40
const ANNOTATION_COLORS = ['red', 'blue', 'green'] as const

type WhiteboardTool = 'draw' | 'eraser'

export type PracticeWhiteboardHandle = {
  clear: () => void
  exportImage: () => Promise<{ imageBase64: string; mimeType: 'image/png' } | null>
  renderAnnotations: (annotations: StrokeAnnotation[]) => void
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
    const annotationIdsRef = useRef<Set<TLShapeId>>(new Set())
    const lastExportRef = useRef<{
      worldOriginX: number
      worldOriginY: number
      width: number
      height: number
    } | null>(null)

    useEffect(() => {
      editorRef.current?.setCurrentTool(tool)
    }, [tool])

    useImperativeHandle(
      ref,
      () => ({
        clear() {
          const editor = editorRef.current
          if (!editor) return
          const shapeIds = Array.from(editor.getCurrentPageShapeIds()).filter(
            (id) => !annotationIdsRef.current.has(id)
          )
          if (shapeIds.length > 0) editor.deleteShapes(shapeIds)
        },

        async exportImage() {
          const editor = editorRef.current
          if (!editor) return null

          const shapeIds = Array.from(editor.getCurrentPageShapeIds()).filter(
            (id) => !annotationIdsRef.current.has(id)
          )
          if (shapeIds.length === 0) return null

          let minX = Infinity
          let minY = Infinity
          for (const id of shapeIds) {
            const bounds = editor.getShapePageBounds(id)
            if (bounds) {
              if (bounds.minX < minX) minX = bounds.minX
              if (bounds.minY < minY) minY = bounds.minY
            }
          }
          const worldOriginX = isFinite(minX) ? minX - 32 : 0
          const worldOriginY = isFinite(minY) ? minY - 32 : 0

          const result = await editor.toImage(shapeIds, {
            format: 'png',
            background: true,
            scale: 1,
            padding: 32,
          })

          lastExportRef.current = {
            worldOriginX,
            worldOriginY,
            width: result.width,
            height: result.height,
          }

          return {
            imageBase64: await blobToBase64(result.blob),
            mimeType: 'image/png' as const,
          }
        },

        renderAnnotations(annotations: StrokeAnnotation[]) {
          const editor = editorRef.current
          if (!editor) return

          const prev = Array.from(annotationIdsRef.current)
          if (prev.length) editor.deleteShapes(prev)
          annotationIdsRef.current = new Set()

          if (!annotations?.length) return

          const exportInfo = lastExportRef.current
          const worldOriginX = exportInfo?.worldOriginX ?? 0
          const worldOriginY = exportInfo?.worldOriginY ?? 0
          const imgW = exportInfo?.width ?? 1000
          const imgH = exportInfo?.height ?? 1000

          const newIds: TLShapeId[] = []
          for (let i = 0; i < annotations.length; i++) {
            const ann = annotations[i]
            const color = ANNOTATION_COLORS[i % ANNOTATION_COLORS.length]
            const px = (ann.center[0] / 1000) * imgW
            const py = (ann.center[1] / 1000) * imgH
            const circleId = createShapeId()
            editor.createShapes([
              {
                id: circleId,
                type: 'geo',
                x: worldOriginX + px - CIRCLE_RADIUS,
                y: worldOriginY + py - CIRCLE_RADIUS,
                props: {
                  geo: 'ellipse',
                  w: CIRCLE_RADIUS * 2,
                  h: CIRCLE_RADIUS * 2,
                  color,
                  fill: 'none',
                  size: 'm',
                  dash: 'solid',
                },
              },
            ])
            newIds.push(circleId)
          }
          annotationIdsRef.current = new Set(newIds)
        },
      }),
      []
    )

    return (
      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border">
        <Tldraw
          components={HIDDEN_UI}
          licenseKey={TLDRAW_LICENSE_KEY}
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
