import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';

/**
 * GET /api/resolve-plugin/download
 * 
 * Creates a zip file of the davinci-plugin directory and streams it to the client
 */
export async function GET(_request: NextRequest) {
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
    } catch (error) {
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

        // Add all files from the plugin directory
        addDirectoryToArchive(archive, pluginDir, 'davinci-plugin');

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

/**
 * Recursively add directory contents to archive
 */
function addDirectoryToArchive(archive: archiver.Archiver, dirPath: string, basePath: string) {
  const files = readdirSync(dirPath);

  for (const file of files) {
    const filePath = join(dirPath, file);
    const relativePath = join(basePath, file);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      // Skip node_modules and other unnecessary directories
      if (file === 'node_modules' || file === '__pycache__' || file === '.git') {
        continue;
      }
      addDirectoryToArchive(archive, filePath, relativePath);
    } else {
      // Skip zip files and other unnecessary files
      if (file.endsWith('.zip') || file.endsWith('.pyc')) {
        continue;
      }
      archive.file(filePath, { name: relativePath });
    }
  }
}

