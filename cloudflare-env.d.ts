declare namespace Cloudflare {
  interface Env {
    LOSTARK_API_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
