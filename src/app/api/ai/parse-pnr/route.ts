import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAirlineMessage } from '@/lib/ai/parse-booking';
import { parseExcelFile } from '@/lib/ai/parse-excel';

/** Max base64 image size: ~10 MB raw → ~13.3 MB base64. */
const MAX_IMAGE_BASE64_LENGTH = 14_000_000;

/**
 * Max base64 spreadsheet size: ~5 MB raw → ~6.7 MB base64.
 *
 * The image path was capped and this one was not, so an upload of any size was
 * decoded into memory and handed to the spreadsheet parser. A workbook is far
 * smaller than an image in practice; 5 MB is generous for the sheets this
 * system deals with.
 */
const MAX_EXCEL_BASE64_LENGTH = 7_000_000;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // No `model` field: the browser never sent one, and accepting it would let a
    // signed-in user aim this key at any model they liked. Pinning a model is an
    // operator decision, made with `GEMINI_MODEL` (docs/operations.md).
    const body = (await request.json()) as {
      text?: string;
      imageBase64?: string;
      imageMimeType?: string;
      excelBase64?: string;
      excelFileName?: string;
    };

    if (body.excelBase64) {
      if (body.excelBase64.length > MAX_EXCEL_BASE64_LENGTH) {
        return NextResponse.json(
          { error: 'Spreadsheet too large. Maximum size is ~5 MB.' },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(body.excelBase64, 'base64');
      const drafts = parseExcelFile(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        body.excelFileName || 'upload.xlsx'
      );
      return NextResponse.json({ ok: true, drafts });
    }

    const text = body.text?.trim() ?? '';
    const imageBase64 = body.imageBase64?.trim() ?? '';

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: 'Provide either airline message text, an image, or an Excel file.' },
        { status: 400 }
      );
    }

    if (imageBase64 && imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json(
        { error: 'Image too large. Maximum size is ~10 MB.' },
        { status: 400 }
      );
    }

    const drafts = await parseAirlineMessage(text, {
      imageBase64: imageBase64 || undefined,
      imageMimeType: body.imageMimeType || undefined,
    });

    return NextResponse.json({
      ok: true,
      drafts,
    });
  } catch (err) {
    // Logged in full server-side, but the response stays generic: the thrown
    // message can carry a provider's raw error body, which is not the browser's
    // business.
    console.error('AI Intake parse error:', err);
    return NextResponse.json(
      { ok: false, error: 'Could not parse this input. Try again, or enter the booking manually.' },
      { status: 500 }
    );
  }
}
