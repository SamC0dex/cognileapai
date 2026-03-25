/**
 * Mind Map Export Utilities
 * PNG export uses html-to-image (dynamically imported in the viewer)
 * PDF export uses pdfmake (already a dependency)
 */

export async function exportMindMapAsPDF(title: string): Promise<void> {
  try {
    const { toPng } = await import('html-to-image')
    const element = document.querySelector('.react-flow') as HTMLElement
    if (!element) throw new Error('Mind map element not found')

    const dataUrl = await toPng(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      filter: (node) => {
        if (node.classList?.contains('react-flow__minimap')) return false
        if (node.classList?.contains('react-flow__controls')) return false
        return true
      },
    })

    const pdfMake = await import('pdfmake/build/pdfmake')

    const docDefinition = {
      pageSize: 'A4' as const,
      pageOrientation: 'landscape' as const,
      pageMargins: [40, 60, 40, 60] as [number, number, number, number],
      content: [
        {
          text: title,
          style: 'header',
          margin: [0, 0, 0, 20] as [number, number, number, number],
        },
        {
          image: dataUrl,
          width: 720,
          alignment: 'center' as const,
        },
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          color: '#0d9488',
        },
      },
    }

    pdfMake.default.createPdf(docDefinition).download(
      `${title.replace(/[^a-zA-Z0-9]/g, '_')}_mind_map.pdf`
    )
  } catch (error) {
    console.error('Failed to export mind map as PDF:', error)
    throw error
  }
}

export async function exportMindMapAsSVG(title: string): Promise<void> {
  try {
    const { toSvg } = await import('html-to-image')
    const element = document.querySelector('.react-flow') as HTMLElement
    if (!element) throw new Error('Mind map element not found')

    const dataUrl = await toSvg(element, {
      filter: (node) => {
        if (node.classList?.contains('react-flow__minimap')) return false
        if (node.classList?.contains('react-flow__controls')) return false
        return true
      },
    })

    const { saveAs } = await import('file-saver')
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    saveAs(blob, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_mind_map.svg`)
  } catch (error) {
    console.error('Failed to export mind map as SVG:', error)
    throw error
  }
}
