import { NextResponse } from 'next/server';

export async function POST(req: Request) {
	try {
		const { base64ImageData, prompt } = await req.json();

		if (!base64ImageData || !prompt) {
			return NextResponse.json({ error: 'Missing base64ImageData or prompt' }, { status: 400 });
		}

		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return NextResponse.json({ error: 'Server misconfigured: missing GEMINI_API_KEY' }, { status: 500 });
		}

		const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

		const payload = {
			contents: [{
				parts: [
					{ text: prompt },
					{ inlineData: { mimeType: "image/jpeg", data: base64ImageData } }
				]
			}],
			generationConfig: {
				responseMimeType: "application/json",
				responseSchema: {
					type: "OBJECT",
					properties: {
						invoiceNumber: { type: "STRING" },
						companyNumber: { type: "STRING" },
						date: { type: "STRING" },
						totalAmount: { type: "STRING" }
					},
					required: ["invoiceNumber", "companyNumber", "date", "totalAmount"]
				}
			}
		};

		const upstreamResponse = await fetch(apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!upstreamResponse.ok) {
			let details: unknown = undefined;
			try {
				details = await upstreamResponse.json();
			} catch {
				try {
					details = await upstreamResponse.text();
				} catch {}
			}
			return NextResponse.json({ error: 'Upstream error', details }, { status: upstreamResponse.status });
		}

		const result = await upstreamResponse.json();
		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		return NextResponse.json({ error: 'Server exception', details: (error as Error).message }, { status: 500 });
	}
}


