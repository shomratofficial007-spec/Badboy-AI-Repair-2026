export interface Env {
    OPENROUTER_API_KEY?: string;
}
export type PagesContext<E = Env> = {
    request: Request;
    env: E;
};
export type PagesFunctionHandler<E = Env> = (context: PagesContext<E>) => Promise<Response> | Response;
export declare function handleApiRequest(request: Request, env?: Env): Promise<Response>;
export declare const onRequestOptions: PagesFunctionHandler<Env>;
export declare const onRequestPost: PagesFunctionHandler<Env>;
export declare const onRequest: PagesFunctionHandler<Env>;
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
