const apiKey = process.env.GEMINI_API_KEY;
const selectedModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (!apiKey) {
  console.error('GEMINI_API_KEYが未設定です。.env.localに設定してから再実行してください。');
  process.exitCode = 1;
} else {
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const listResponse = await fetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`);
  const listBody = await listResponse.json().catch(() => ({}));

  if (!listResponse.ok) {
    console.error(`モデル一覧の取得に失敗しました (${listResponse.status})。`);
    console.error(JSON.stringify(listBody, null, 2));
    process.exitCode = 1;
  } else {
    const availableModels = (listBody.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name.replace(/^models\//, ''));

    console.log(`選択中のモデル: ${selectedModel}`);
    console.log(`generateContent対応モデル (${availableModels.length}件):`);
    console.log(availableModels.join('\n'));

    if (!availableModels.includes(selectedModel)) {
      console.error(`\n${selectedModel}は、このAPIキーで取得した対応モデル一覧にありません。`);
      console.error('一覧のモデル名をGEMINI_MODELへ設定してください。');
      process.exitCode = 1;
    } else {
      const testResponse = await fetch(
        `${baseUrl}/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'JSONで {"ok":true} のみ返してください。' }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32 },
          }),
        },
      );
      const testBody = await testResponse.json().catch(() => ({}));

      if (!testResponse.ok) {
        console.error(`\n最小リクエストに失敗しました (${testResponse.status})。`);
        console.error(JSON.stringify(testBody, null, 2));
        if (testResponse.status === 429) {
          console.error('\nこれはアプリの抽出処理ではなく、APIキー/モデル側のクォータ制限です。');
        }
        process.exitCode = 1;
      } else {
        console.log('\nGemini APIの最小リクエストに成功しました。');
      }
    }
  }
}
