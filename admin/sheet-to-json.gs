/**
 * Googleスプレッドシート → subsidies.json 変換スクリプト
 * シート1「補助金マスタ」+ シート2「要件」→ JSONを生成してドライブに保存
 *
 * 使い方:
 *   1. このスクリプトをスプレッドシートに紐付けたGASプロジェクトとして開く
 *   2. スプレッドシートのメニュー「補助金ツール」→「JSONを書き出す」を実行
 *   3. 生成された subsidies.json をGitHubにアップロードする
 *
 * GitHub自動Push（任意）:
 *   スクリプトプロパティに以下を設定すると自動コミットが有効になる
 *   - GITHUB_TOKEN : Personal Access Token (repo スコープ)
 *   - GITHUB_OWNER : リポジトリオーナー名
 *   - GITHUB_REPO  : リポジトリ名
 *   - GITHUB_BRANCH: ブランチ名（例: main）
 */

// ===== メニュー追加 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('補助金ツール')
    .addItem('JSONを書き出す', 'exportJson')
    .addItem('バリデーションのみ実行', 'validateOnly')
    .addToUi();
}

// ===== メイン：JSON書き出し =====
function exportJson() {
  const errors = [];
  const result = buildJson(errors);

  if (errors.length > 0) {
    const msg = '以下のエラーが検出されました:\n\n' + errors.join('\n');
    SpreadsheetApp.getUi().alert('バリデーションエラー', msg, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  const json = JSON.stringify(result, null, 2);
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // Googleドライブに保存
  const fileName = 'subsidies.json';
  const existingFiles = DriveApp.getFilesByName(fileName);
  if (existingFiles.hasNext()) {
    existingFiles.next().setContent(json);
  } else {
    DriveApp.createFile(fileName, json, MimeType.PLAIN_TEXT);
  }

  SpreadsheetApp.getUi().alert(
    '完了',
    `${fileName} をドライブに保存しました。\nGitHubにアップロードしてください。\n\nバージョン: ${today}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  // 任意：GitHub APIへ自動Push
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (token) {
    pushToGitHub(json, fileName, today);
  }
}

// ===== バリデーションのみ =====
function validateOnly() {
  const errors = [];
  buildJson(errors);
  if (errors.length === 0) {
    SpreadsheetApp.getUi().alert('OK', 'バリデーション問題なし。JSONを書き出せます。', SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    const msg = '以下の問題が検出されました:\n\n' + errors.join('\n');
    SpreadsheetApp.getUi().alert('バリデーションエラー', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ===== JSONビルド =====
function buildJson(errors) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName('補助金マスタ');
  const reqSheet = ss.getSheetByName('要件');

  if (!masterSheet) { errors.push('シート「補助金マスタ」が見つかりません'); return null; }
  if (!reqSheet) { errors.push('シート「要件」が見つかりません'); return null; }

  const masterData = masterSheet.getDataRange().getValues();
  const reqData = reqSheet.getDataRange().getValues();

  const masterHeaders = masterData[0];
  const reqHeaders = reqData[0];

  // ヘッダーインデックス取得
  const mIdx = {};
  masterHeaders.forEach((h, i) => { mIdx[h] = i; });
  const rIdx = {};
  reqHeaders.forEach((h, i) => { rIdx[h] = i; });

  // 必須ヘッダーチェック（マスタ）
  const requiredMasterCols = ['id','category','name_ja','summary_ja','amount_ja','contact_name','contact_tel','contact_dept','source_url','status'];
  requiredMasterCols.forEach(col => {
    if (mIdx[col] === undefined) errors.push(`補助金マスタに列「${col}」がありません`);
  });

  // 必須ヘッダーチェック（要件）
  const requiredReqCols = ['subsidy_id','req_id','group','question_ja','type','required'];
  requiredReqCols.forEach(col => {
    if (rIdx[col] === undefined) errors.push(`要件シートに列「${col}」がありません`);
  });

  if (errors.length > 0) return null;

  // 補助金マスタ読み込み
  const seenIds = new Set();
  const subsidies = [];

  for (let r = 1; r < masterData.length; r++) {
    const row = masterData[r];
    const id = String(row[mIdx['id']] || '').trim();
    if (!id) continue;

    // id重複チェック
    if (seenIds.has(id)) {
      errors.push(`行${r + 1}: 補助金id「${id}」が重複しています`);
    }
    seenIds.add(id);

    // 必須ja項目チェック
    if (!row[mIdx['name_ja']]) errors.push(`行${r + 1} (${id}): name_jaが空です`);
    if (!row[mIdx['summary_ja']]) errors.push(`行${r + 1} (${id}): summary_jaが空です`);
    if (!row[mIdx['amount_ja']]) errors.push(`行${r + 1} (${id}): amount_jaが空です`);

    // status チェック
    const status = String(row[mIdx['status']] || 'active').trim();
    if (!['active', 'closed'].includes(status)) {
      errors.push(`行${r + 1} (${id}): statusは"active"または"closed"のみ有効です（現在:"${status}"）`);
    }

    subsidies.push({
      id,
      category: String(row[mIdx['category']] || '').trim(),
      name: buildMultiLang(row, mIdx, 'name'),
      summary: buildMultiLang(row, mIdx, 'summary'),
      amount: { ja: String(row[mIdx['amount_ja']] || '').trim() },
      contact: {
        name: String(row[mIdx['contact_name']] || '').trim(),
        tel: String(row[mIdx['contact_tel']] || '').trim(),
        dept: String(row[mIdx['contact_dept']] || '').trim(),
      },
      sourceUrl: String(row[mIdx['source_url']] || '').trim(),
      kiyouUrl: String(row[mIdx['kiyou_url'] ?? ''] || '').trim(),
      status,
      note: { ja: String(row[mIdx['note_ja'] ?? ''] || '').trim() },
      requirements: [],
    });
  }

  // 要件読み込み
  for (let r = 1; r < reqData.length; r++) {
    const row = reqData[r];
    const subsidyId = String(row[rIdx['subsidy_id']] || '').trim();
    if (!subsidyId) continue;

    const sub = subsidies.find(s => s.id === subsidyId);
    if (!sub) {
      errors.push(`要件行${r + 1}: subsidy_id「${subsidyId}」に対応する補助金がありません`);
      continue;
    }

    const type = String(row[rIdx['type']] || '').trim();
    if (!['yesno', 'choice'].includes(type)) {
      errors.push(`要件行${r + 1}: typeは"yesno"または"choice"のみ有効です（現在:"${type}"）`);
    }

    const question = buildMultiLang(row, rIdx, 'question');
    if (!question.ja) {
      errors.push(`要件行${r + 1}: question_jaが空です`);
    }

    const req = {
      id: String(row[rIdx['req_id']] || '').trim() || `req${sub.requirements.length + 1}`,
      group: String(row[rIdx['group']] || '').trim(),
      question,
      type,
      required: String(row[rIdx['required']] || 'true').toLowerCase() !== 'false',
    };

    // choices（JSON文字列として格納）
    if (type === 'choice') {
      const choicesRaw = String(row[rIdx['choices'] ?? ''] || '').trim();
      if (choicesRaw) {
        try {
          req.choices = JSON.parse(choicesRaw);
        } catch (e) {
          errors.push(`要件行${r + 1}: choicesのJSON形式が不正です`);
        }
      } else {
        errors.push(`要件行${r + 1}: type=choiceですがchoicesが空です`);
      }
    }

    sub.requirements.push(req);
  }

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  return {
    version: today,
    lastUpdated: today,
    subsidies,
  };
}

// ===== 多言語フィールドビルダー =====
function buildMultiLang(row, idx, prefix) {
  const langs = ['ja', 'en', 'zh', 'ko', 'vi'];
  const result = {};
  langs.forEach(lang => {
    const colName = `${prefix}_${lang}`;
    if (idx[colName] !== undefined) {
      const val = String(row[idx[colName]] || '').trim();
      if (val) result[lang] = val;
    }
  });
  return result;
}

// ===== GitHub API Push（任意） =====
function pushToGitHub(content, fileName, dateStr) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const token = props['GITHUB_TOKEN'];
  const owner = props['GITHUB_OWNER'];
  const repo = props['GITHUB_REPO'];
  const branch = props['GITHUB_BRANCH'] || 'main';

  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/data/${fileName}`;

  // 現在のファイルのSHAを取得
  let sha = '';
  const getResp = UrlFetchApp.fetch(apiBase + `?ref=${branch}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    muteHttpExceptions: true,
  });
  if (getResp.getResponseCode() === 200) {
    sha = JSON.parse(getResp.getContentText()).sha;
  }

  const payload = {
    message: `data: ${fileName}を更新 (${dateStr})`,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch,
  };
  if (sha) payload.sha = sha;

  const putResp = UrlFetchApp.fetch(apiBase, {
    method: 'put',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (putResp.getResponseCode() === 200 || putResp.getResponseCode() === 201) {
    SpreadsheetApp.getUi().alert('GitHub Push完了', `${fileName} をGitHubにコミットしました。`, SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert('GitHub Pushエラー', putResp.getContentText(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
