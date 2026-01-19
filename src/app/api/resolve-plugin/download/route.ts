import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';

/**
 * GET /api/resolve-plugin/download
 * 
 * Creates a zip file of the davinci-plugin directory and streams it to the client
 */
export async function GET() {
  try {
    const pluginDir = join(process.cwd(), 'davinci-plugin');
    
    // Check if directory exists
    try {
      const stats = statSync(pluginDir);
      if (!stats.isDirectory()) {
        return NextResponse.json(
          { error: 'Plugin directory not found' },
          { status: 404 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Plugin directory not found' },
        { status: 404 }
      );
    }

    // Create a readable stream for the zip file
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set response headers
    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', 'attachment; filename="concepto_resolve_plugin.zip"');

    // Create a readable stream from the archive
    const stream = new ReadableStream({
      start(controller) {
        archive.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        archive.on('end', () => {
          controller.close();
        });

        archive.on('error', (err: Error) => {
          controller.error(err);
        });

        // Only include the main plugin file and essential documentation
        const filesToInclude = [
          'concepto_resolve_sync_gui.py',
          'README.md',
          'INSTALLATION.md',
        ];

        for (const file of filesToInclude) {
          const filePath = join(pluginDir, file);
          try {
            const stats = statSync(filePath);
            if (stats.isFile()) {
              archive.file(filePath, { name: file });
            }
          } catch {
            // Skip if file doesn't exist
            continue;
          }
        }

        // Finalize the archive
        archive.finalize();
      }
    });

    return new NextResponse(stream, { headers });
  } catch (error: unknown) {
    console.error('Error creating plugin zip:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create plugin zip file', details: errorMessage },
      { status: 500 }
    );
  }
}

