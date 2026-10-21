"use client";

export async function catalogRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { method, headers: body instanceof File ? { "Content-Type": body.type } : body !== undefined ? { "Content-Type": "application/json" } : {}, body: body instanceof File ? body : body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" }); }
  catch { throw new Error("ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? (response.status === 401 ? "نشست منقضی شده است؛ دوباره وارد شوید." : "عملیات انجام نشد. دوباره تلاش کنید."));
  return result as T;
}
