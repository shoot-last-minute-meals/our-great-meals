import type { Route } from "./+types/accountset"
import { data, Form, redirect, useActionData, Link, useSearchParams } from "react-router";
import { getSession, commitSession } from "~/utils/session.server";
import { fileStorage, getAvatarStorageKey } from "~/utils/image-storage.server";
import { type FileUpload, parseFormData } from "@remix-run/form-data-parser";
import { useEffect, useRef, useState } from "react";
import { getRecipesByUserId, deleteRecipe } from "~/utils/models/recipe.model";
import { getRecipeReviews } from "~/utils/models/review.model";
import type { Recipe } from "~/utils/models/recipe.model";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "Account Settings" },
        { name: "description", content: "Account Settings" },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    if (!session.has("user")) {
        return redirect("/login?redirectTo=/accountset");
    }
    const user = session.get("user")!;
    const [hasAvatar, recipes] = await Promise.all([
        fileStorage.has(getAvatarStorageKey(user.id)),
        getRecipesByUserId(user.id),
    ]);
    const reviewsMap = await getRecipeReviews(recipes);
    const reviews = Object.fromEntries(reviewsMap);
    return { user, hasAvatar, recipes, reviews };
}

export async function action({ request }: Route.ActionArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    if (!session.has("user")) {
        return redirect("/login?redirectTo=/accountset");
    }
    const user = session.get("user")!;
    const storageKey = getAvatarStorageKey(user.id);
    const contentType = request.headers.get("Content-Type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        if (formData.get("intent") === "delete") {
            await fileStorage.remove(storageKey);
            return { success: true, message: "Profile picture deleted.", intent: "delete" };
        }
        if (formData.get("intent") === "deleteRecipe") {
            const recipeId = formData.get("recipeId") as string;
            const authorization = session.get("authorization")!;
            const cookie = request.headers.get("Cookie") ?? "";
            const result = await deleteRecipe(recipeId, authorization, cookie);
            if (result.status === 200) {
                return { success: true, message: "Recipe deleted.", intent: "deleteRecipe", recipeId };
            }
            return { error: result.message ?? "Failed to delete recipe.", intent: "deleteRecipe" };
        }
        return { error: "Unknown action.", intent: "unknown" };
    }

    let fileSaved = false;
    const formData = await parseFormData(request, { maxFileSize: 5 * 1024 * 1024 }, async (fileUpload: FileUpload) => {
        if (fileUpload.fieldName === "avatar" && fileUpload.type.startsWith("image/")) {
            await fileStorage.set(storageKey, fileUpload);
            fileSaved = true;
        }
    });

    const intent = formData.get("intent") as string;

    if (intent === "save-picture") {
        if (!fileSaved) {
            return { error: "No image received — please select a file and try again.", intent: "avatar" };
        }
        return { success: true, message: "Profile picture saved.", intent: "avatar" };
    }

    if (intent === "update-profile") {
        const newBio = (formData.get("bio") as string)?.trim() || null;
        const response = await fetch(`${process.env.REST_API_URL}/user/update-profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Cookie: request.headers.get("Cookie") ?? "" },
            body: JSON.stringify({
                bio: newBio,
                currentPassword: formData.get("currentPassword") ?? "",
                newPassword: formData.get("newPassword") ?? "",
                confirmPassword: formData.get("confirmPassword") ?? "",
            }),
        });
        const result = await response.json();
        if (result.status === 200) {
            session.set("user", { ...user, bio: newBio });
            const message = fileSaved ? "Profile picture and profile saved." : "Profile updated successfully.";
            return data(
                { success: true, message, intent: "update-profile" },
                { headers: { "Set-Cookie": await commitSession(session) } }
            );
        }
        return { error: result.message ?? "Failed to update profile.", intent: "update-profile" };
    }

    return { error: "Unknown action.", intent: "unknown" };
}

// ── Sidebar nav item ─────────────────────────────────────────
function SidebarItem({ label, active, href }: { label: string; active: boolean; href: string }) {
    return (
        <Link
            to={href}
            className={[
                "w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors",
                active
                    ? "border-gray-300 bg-white font-semibold text-gray-900"
                    : "border-gray-200 text-gray-500 hover:bg-white hover:text-gray-800",
            ].join(" ")}
        >
            {label}
        </Link>
    );
}

// ── Profile field row ─────────────────────────────────────────
function FieldRow({
    label,
    value,
    action,
    onAction,
}: {
    label: string;
    value: React.ReactNode;
    action?: string;
    onAction?: () => void;
}) {
    return (
        <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
            <span className="flex-1 text-sm text-gray-800">{value}</span>
            {action && (
                <button
                    type="button"
                    onClick={onAction}
                    className="ml-4 px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
                >
                    {action}
                </button>
            )}
        </div>
    );
}

const CARD_BG = ["bg-green-50","bg-amber-50","bg-blue-50","bg-pink-50","bg-purple-50","bg-teal-50"];

export default function AccountSet({ loaderData }: Route.ComponentProps) {
    const { user, hasAvatar, recipes, reviews } = loaderData;
    const actionData = useActionData<typeof action>();

    const [searchParams] = useSearchParams();
    const activeSection = (searchParams.get("tab") ?? "profile") as "profile" | "security" | "recipes";
    const [editingBio, setEditingBio] = useState(false);
    const [avatarVersion, setAvatarVersion] = useState(1);
    const [showAvatar, setShowAvatar] = useState(hasAvatar);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [clientError, setClientError] = useState<string | null>(null);

    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const MAX_SIZE = 5 * 1024 * 1024;

    useEffect(() => { setShowAvatar(hasAvatar); }, [hasAvatar]);

    useEffect(() => {
        if (actionData && "success" in actionData && actionData.success) {
            setAvatarVersion(Date.now());
            setSelectedFile(null);
            setPreviewUrl("");
            setEditingBio(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }, [actionData]);

    useEffect(() => {
        if (selectedFile) {
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [selectedFile]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!ALLOWED_TYPES.includes(file.type)) {
            setClientError("Invalid file type. Please select JPEG, PNG, GIF, or WebP.");
            event.target.value = "";
            return;
        }
        if (file.size > MAX_SIZE) {
            setClientError("Image too large. Maximum size is 5 MB.");
            event.target.value = "";
            return;
        }
        setClientError(null);
        setSelectedFile(file);
    };

    const handleClearSelection = () => {
        setSelectedFile(null);
        setPreviewUrl("");
        setClientError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Joined date formatted as "Jan 2025"
    const joinedDate = user.createdAt
        ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : null;

    // Initials fallback
    const initials = (user.username ?? "?").slice(0, 2).toUpperCase();

    return (
        <div className="flex flex-col md:flex-row max-w-5xl mx-auto px-4 py-10 gap-8 min-h-[calc(100vh-3.5rem)]">

            {/* ── Left sidebar ── */}
            <aside className="md:w-52 shrink-0">
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3 px-1">Settings</p>
                <div className="flex flex-col gap-2">
                    <SidebarItem label="Profile"          active={activeSection === "profile"}  href="/accountset" />
                    <SidebarItem label="Change Password"  active={activeSection === "security"} href="/accountset?tab=security" />
                    <SidebarItem label={`Saved Recipes${recipes.length ? ` (${recipes.length})` : ""}`} active={activeSection === "recipes"} href="/accountset?tab=recipes" />
                </div>
            </aside>

            {/* ── Right content ── */}
            <main className="flex-1 min-w-0">

                {/* ════════════ PROFILE SECTION ════════════ */}
                {activeSection === "profile" && (
                    <>
                        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage your personal information and public profile.</p>

                        <Form method="post" encType="multipart/form-data">
                            {/* Hidden file input — triggered by "Change photo" button */}
                            <input
                                type="file"
                                id="avatar-file"
                                name="avatar"
                                ref={fileInputRef}
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <div className="border border-gray-200 rounded-2xl overflow-hidden mt-6">

                                {/* ── Avatar + name row ── */}
                                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                                    <div className="flex items-center gap-4">
                                        {previewUrl ? (
                                            <img src={previewUrl} alt="Preview"
                                                className="w-14 h-14 rounded-full object-cover border border-gray-200" />
                                        ) : showAvatar ? (
                                            <img src={`/api/avatar/${user.id}?v=${avatarVersion}`} alt="Avatar"
                                                className="w-14 h-14 rounded-full object-cover border border-gray-200"
                                                onError={() => setShowAvatar(false)} />
                                        ) : (
                                            <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-semibold text-lg select-none">
                                                {initials}
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-semibold text-gray-900">{user.username}</p>
                                            {joinedDate && (
                                                <p className="text-sm text-gray-400">Member since {joinedDate}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {selectedFile ? (
                                            <>
                                                <button type="button" onClick={handleClearSelection}
                                                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                                                    Cancel
                                                </button>
                                                <button type="submit" name="intent" value="save-picture"
                                                    className="px-4 py-1.5 border border-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                                                    Save picture
                                                </button>
                                            </>
                                        ) : showAvatar ? (
                                            <>
                                                <button type="button" onClick={() => fileInputRef.current?.click()}
                                                    className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                                                    Change photo
                                                </button>
                                                <Form method="post" className="inline">
                                                    <input type="hidden" name="intent" value="delete" />
                                                    <button type="submit"
                                                        className="px-4 py-1.5 border border-red-200 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                                                        Remove
                                                    </button>
                                                </Form>
                                            </>
                                        ) : (
                                            <button type="button" onClick={() => fileInputRef.current?.click()}
                                                className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                                                Change photo
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* avatar errors */}
                                {(clientError || (actionData && "error" in actionData && (actionData.intent === "avatar" || actionData.intent === "delete"))) && (
                                    <p className="px-6 py-2 text-sm text-red-600">
                                        {clientError ?? ("error" in actionData! && actionData.error)}
                                    </p>
                                )}
                                {actionData && "intent" in actionData && actionData.intent === "avatar" && "success" in actionData && actionData.success && (
                                    <p className="px-6 py-2 text-sm text-green-600">{actionData.message}</p>
                                )}

                                {/* ── Field rows ── */}
                                <div className="divide-y divide-gray-100">
                                    <FieldRow label="Username" value={user.username} />
                                    <FieldRow label="Member since" value={joinedDate ?? "—"} />

                                    {/* Bio row with inline edit */}
                                    <div>
                                        <div className="flex items-center justify-between px-6 py-4">
                                            <span className="text-sm text-gray-500 w-28 shrink-0">Bio</span>
                                            <span className="flex-1 text-sm text-gray-800 truncate">{user.bio ?? "—"}</span>
                                            <button type="button" onClick={() => setEditingBio(b => !b)}
                                                className="ml-4 px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shrink-0">
                                                {editingBio ? "Cancel" : "Edit"}
                                            </button>
                                        </div>
                                        {editingBio && (
                                            <div className="px-6 pb-5">
                                                <textarea
                                                    name="bio"
                                                    rows={3}
                                                    defaultValue={user.bio ?? ""}
                                                    maxLength={512}
                                                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 resize-y"
                                                    placeholder="Tell us a little about yourself…"
                                                />
                                                <div className="flex gap-2 mt-2">
                                                    <button type="submit" name="intent" value="update-profile"
                                                        className="px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
                                                        Save
                                                    </button>
                                                    <button type="button" onClick={() => setEditingBio(false)}
                                                        className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                                                        Cancel
                                                    </button>
                                                </div>
                                                {actionData && "intent" in actionData && actionData.intent === "update-profile" && (
                                                    <>
                                                        {"error" in actionData && actionData.error && (
                                                            <p className="mt-2 text-sm text-red-600">{actionData.error}</p>
                                                        )}
                                                        {"success" in actionData && actionData.success && (
                                                            <p className="mt-2 text-sm text-green-600">{actionData.message}</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </Form>
                    </>
                )}

                {/* ════════════ SECURITY SECTION ════════════ */}
                {activeSection === "security" && (
                    <>
                        <h1 className="text-2xl font-bold text-gray-900">Security</h1>
                        <p className="text-sm text-gray-500 mt-1">Update your password to keep your account secure.</p>

                        <Form method="post" encType="multipart/form-data">
                            <div className="border border-gray-200 rounded-2xl overflow-hidden mt-6">
                                <div className="px-6 py-5 border-b border-gray-100">
                                    <p className="text-sm font-semibold text-gray-800">Change password</p>
                                    <p className="text-xs text-gray-400 mt-0.5">Leave blank to keep your current password.</p>
                                </div>
                                <div className="px-6 py-5 flex flex-col gap-4 max-w-sm">
                                    <input type="password" name="currentPassword"
                                        className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                                        placeholder="Current password" />
                                    <input type="password" name="newPassword"
                                        className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                                        placeholder="New password" />
                                    <input type="password" name="confirmPassword"
                                        className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                                        placeholder="Confirm new password" />

                                    {actionData && "intent" in actionData && actionData.intent === "update-profile" && (
                                        <>
                                            {"error" in actionData && actionData.error && (
                                                <p className="text-sm text-red-600">{actionData.error}</p>
                                            )}
                                            {"success" in actionData && actionData.success && (
                                                <p className="text-sm text-green-600">{actionData.message}</p>
                                            )}
                                        </>
                                    )}

                                    <button type="submit" name="intent" value="update-profile"
                                        className="self-start px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
                                        Update password
                                    </button>
                                </div>
                            </div>
                        </Form>
                    </>
                )}

                {/* ════════════ SAVED RECIPES SECTION ════════════ */}
                {activeSection === "recipes" && (
                    <>
                        <h1 className="text-2xl font-bold text-gray-900">Saved Recipes</h1>
                        <p className="text-sm text-gray-500 mt-1">Recipes you've created and saved.</p>

                        {actionData && "intent" in actionData && actionData.intent === "deleteRecipe" && (
                            <p className={`mt-3 text-sm ${"error" in actionData ? "text-red-600" : "text-green-600"}`}>
                                {"error" in actionData ? actionData.error : (actionData as any).message}
                            </p>
                        )}

                        {recipes.length === 0 ? (
                            <div className="mt-10 text-center border border-gray-200 rounded-2xl p-10 bg-white">
                                <p className="text-sm text-gray-400">You haven't saved any recipes yet.</p>
                                <Link
                                    to="/#upload"
                                    className="mt-3 inline-block text-sm text-amber-600 hover:text-amber-700 font-medium hover:underline"
                                >
                                    Upload a photo to get started →
                                </Link>
                            </div>
                        ) : (
                            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {recipes.map((recipe: Recipe, i: number) => {
                                    const bg = CARD_BG[i % CARD_BG.length];
                                    const reviewList: any[] = reviews[recipe.id] ?? [];
                                    const avgRating = reviewList.length
                                        ? (reviewList.reduce((s: number, r: any) => s + r.rating, 0) / reviewList.length).toFixed(1)
                                        : null;
                                    const ingredientNames = recipe.ingredients.slice(0, 4).map((ing: any) => ing.name).join(", ");

                                    return (
                                        <div key={recipe.id} className="border border-gray-200 rounded-2xl overflow-hidden bg-white flex flex-col">
                                            <div className={`${bg} h-36 flex items-center justify-center relative`}>
                                                {recipe.imageUrl ? (
                                                    <img src={recipe.imageUrl} alt={recipe.title} className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="text-4xl" aria-hidden>🍽️</span>
                                                )}
                                            </div>
                                            <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
                                                <h3 className="font-semibold text-gray-900 text-sm leading-snug">{recipe.title}</h3>
                                                <p className="text-xs text-gray-400 leading-snug line-clamp-1">{ingredientNames}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-0.5">
                                                    {recipe.mealCategory && (
                                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                                                            {recipe.mealCategory.toLowerCase()}
                                                        </span>
                                                    )}
                                                    {recipe.cookTime && (
                                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                                                            {recipe.cookTime}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between mt-auto pt-2">
                                                    {avgRating ? (
                                                        <span className="text-xs text-gray-400">★ {avgRating} ({reviewList.length})</span>
                                                    ) : (
                                                        <span className="text-xs text-gray-300">No reviews yet</span>
                                                    )}
                                                    <div className="flex items-center gap-3">
                                                        <Link
                                                            to={`/recipe/${recipe.id}`}
                                                            className="text-xs font-medium text-amber-500 hover:text-amber-600 transition-colors"
                                                        >
                                                            View →
                                                        </Link>
                                                        <Form method="post">
                                                            <input type="hidden" name="intent" value="deleteRecipe" />
                                                            <input type="hidden" name="recipeId" value={recipe.id} />
                                                            <button
                                                                type="submit"
                                                                onClick={e => { if (!confirm(`Delete "${recipe.title}"?`)) e.preventDefault() }}
                                                                className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
                                                            >
                                                                Delete
                                                            </button>
                                                        </Form>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

            </main>
        </div>
    );
}
