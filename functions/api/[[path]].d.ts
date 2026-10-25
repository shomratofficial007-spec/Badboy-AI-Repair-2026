interface Env {
    OPENROUTER_API_KEY?: string;
}
export declare function handleApiRequest(request: Request, env: Env): Promise<Response>;
export declare const onRequestOptions: PagesFunction<Env>;
export declare const onRequestGet: PagesFunction<Env>;
export declare const onRequestPost: PagesFunction<Env>;
declare const _default: {
    fetch(request: Request, env: Env, ctx: {
        waitUntil: (promise: Promise<unknown>) => void;
    }): Promise<Response>;
};
export default _default;
