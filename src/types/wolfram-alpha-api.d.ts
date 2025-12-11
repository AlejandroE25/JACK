declare module '@wolfram-alpha/wolfram-alpha-api' {
  interface WolframSubpod {
    plaintext?: string;
    img?: {
      src: string;
      alt: string;
      title: string;
    };
  }

  interface WolframPod {
    title: string;
    subpods: WolframSubpod[];
    primary?: boolean;
  }

  interface WolframQueryResult {
    success: boolean;
    error?: boolean;
    pods?: WolframPod[];
    datatypes?: string;
    timedout?: string;
    timedoutpods?: string;
    timing?: number;
    parsetiming?: number;
    parsetimedout?: boolean;
    recalculate?: string;
    id?: string;
    host?: string;
    server?: string;
    related?: string;
    version?: string;
  }

  interface WolframFullResponse {
    queryresult: WolframQueryResult;
  }

  interface WolframAPI {
    getFull(input: string | object): Promise<WolframFullResponse>;
    getShort(input: string | object): Promise<string>;
    getSpoken(input: string | object): Promise<string>;
  }

  function WolframAlphaAPI(appId: string): WolframAPI;

  export default WolframAlphaAPI;
}
