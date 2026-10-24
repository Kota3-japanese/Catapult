
# BeSmile

BeSmile は、日々の笑顔を記録し、あとから振り返るための Web アプリです。写真とひとことを残し、カレンダーや共有アルバムで思い出を見返せます。

## 主な機能

- **カメラ撮影**：ブラウザからカメラを起動して写真を撮影
- **写真とメモの記録**：写真にひとことを添えて保存
- **記録の振り返り**：カレンダーや一覧から過去の記録を確認
- **笑顔スコアの記録**：笑顔スコアに関する情報を記録
- **共有アルバム**：共有URLを作成して、ほかの人と記録を共有
- **共有URLのコピー**：作成したURLをコピーして共有

※ 笑顔スコアの自動計測や、しきい値を超えた際の自動撮影などは、実装状況に応じて利用できます。

## 使用技術

- HTML
- CSS
- JavaScript（Vanilla JS）
- Supabase
- Supabase Edge Functions
- ブラウザのカメラ API（`getUserMedia()`）

## ディレクトリ構成

Catapult/
├── HTML/                  # HTMLファイル
├── CSS/                   # CSSファイル
├── JS/                    # JavaScriptファイル
├── supabase/
│   ├── config.toml        # Supabaseの設定
│   └── functions/
│       └── shared-album/  # 共有アルバム用Edge Function
├── package.json
└── README.md

## 起動方法

### ブラウザでアクセス(GitHub pages)

次のURLを開きます。
https://kota3-japanese.github.io/Catapult/HTML/

カメラを利用する場合は、ブラウザからのカメラアクセスを許可してください。

## Supabaseの設定

データ保存や共有アルバムを利用するには、Supabaseの設定が必要です。

### キーの取り扱い

- ブラウザ側には公開用のキーのみを設定してください。
- `service_role` キーなどの秘密情報をHTMLやJavaScriptに記載したり、GitHubにコミットしたりしないでください。
- Edge Functionで必要な秘密情報は、Supabaseの環境変数やSecretsに設定してください。
- 共有URLを知っている人が記録を閲覧できる設計の場合、共有する写真やメモの内容に注意してください。

※ テーブル名、Storageのバケット名、SQL定義などは、実際のSupabaseプロジェクトの設定に合わせてください。

## 使い方

1. アプリを開き、カメラ画面からカメラを起動します。
2. 画面の案内に従って写真を撮影します。
3. 写真にメモを添えて記録を保存します。
4. カレンダーや記録一覧から過去の写真やメモを振り返ります。
5. 共有したい場合は「共有URLを作る」を選び、発行されたURLをコピーして共有します。

## 開発について

- `HTML/`、`CSS/`、`JS/` にファイルを分けて管理しています。
- `supabase/functions/shared-album/` には共有アルバム用のEdge Functionがあります。
- `node_modules/` などの生成ファイルや、秘密情報を含むファイルはGitHubに公開しないでください。
- 機能を追加・変更した場合は、READMEの説明も更新してください。

## 注意事項

- カメラの利用可否はブラウザや端末の設定によって異なります。
- 共有URLを受け取った人が記録を閲覧できる可能性があります。
- 公開前にSupabaseのRLS、Storageポリシー、共有用RPCやEdge Functionのアクセス制御を確認してください。
