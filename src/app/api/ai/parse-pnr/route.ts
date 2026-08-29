import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAirlineMessage } from '@/lib/ai/parse-booking';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { text?: string; model?: string };
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json({ error: 'No airline message text provided.' }, { status: 400 });
    }

    const draft = await parseAirlineMessage(text, { model: body.model });

    return NextResponse.json({
      ok: true,
      draft,
    });
  } catch (err) {
    console.error('AI Intake parse error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to parse airline text.',
      },
      { status: 500 }
    );
  }
}
