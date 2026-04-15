import {useState} from "react";
import {data, Form, Link, redirect, useLoaderData, useActionData} from "react-router";
import type {Route} from "./+types/friendprofile";
import {getSession} from "~/utils/session.server";
import {getRecipesByUserId} from "~/utils/models/recipe.model";
import {getRecipeReviews} from "~/utils/models/review.model";
import type {Recipe} from "~/utils/models/recipe.model";

type PublicUser = {
    id: string
    username: string
    avatarUrl: string | null
    bio: string | null
    createdAt: string | null
}

type FriendStatus = "self" | "friends" | "pending" | "none"

export async function loader({request, params}: Route.LoaderArgs) {
    const session = await getSession(request.headers.get("Cookie"))
    if (!session.has("user")) return redirect("/login")

    const currentUser = session.get("user")!

    // Fetch the profile being viewed
    const profileRes = await fetch(`${process.env.REST_API_URL}/user/${params.userId}`)
    const profileResult = await profileRes.json()
    if (profileResult.status !== 200 || !profileResult.data) {
        throw new Response("User not found", {status: 404})
    }
    const friend: PublicUser = profileResult.data

    // Determine friendship status + fetch recipes in parallel
    let friendStatus: FriendStatus = "none"
    const cookie = request.headers.get("Cookie") ?? ""
    const authorization = session.get("authorization") ?? ""

    const [recipesResult, friendsResult, mutualResult] = await Promise.all([
        getRecipesByUserId(params.userId!),
        currentUser.id === params.userId
            ? Promise.resolve(null)
            : fetch(`${process.env.REST_API_URL}/friend`, {
                headers: {Cookie: cookie, Authorization: authorization},
              }).then(friendsRes => friendsRes.ok ? friendsRes.json() : null),
        currentUser.id === params.userId
            ? Promise.resolve(null)
            : fetch(`${process.env.REST_API_URL}/friend/mutual/${params.userId}`, {
                headers: {Cookie: cookie, Authorization: authorization},
              }).then(mutualRes => mutualRes.ok ? mutualRes.json() : null),
    ])

    const recipes: Recipe[] = recipesResult ?? []
    const reviewsMap = await getRecipeReviews(recipes)
    const reviews = Object.fromEntries(reviewsMap)

    if (currentUser.id === params.userId) {
        friendStatus = "self"
    } else if (friendsResult) {
        const friends: PublicUser[] = friendsResult?.data?.friends ?? []
        const pending: PublicUser[] = friendsResult?.data?.pendingRequests ?? []
        if (friends.some((f: PublicUser) => f.id === params.userId)) {
            friendStatus = "friends"
        } else if (pending.some((f: PublicUser) => f.id === params.userId)) {
            friendStatus = "pending"
        }
    }

    const mutualFriends: PublicUser[] = mutualResult?.data?.mutualFriends ?? []

    return {friend, currentUser, friendStatus, recipes, reviews, mutualFriends}
}

export async function action({request, params}: Route.ActionArgs) {
    const session = await getSession(request.headers.get("Cookie"))
    if (!session.has("user")) return redirect("/login")

    const currentUser = session.get("user")!
    const authorization = session.get("authorization") ?? ""
    const cookie = request.headers.get("Cookie") ?? ""

    const formData = await request.formData()
    const intent = formData.get("intent") as string

    if (intent === "addFriend") {
        const response = await fetch(`${process.env.REST_API_URL}/friend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie,
                Authorization: authorization,
            },
            body: JSON.stringify({
                requesteeId: params.userId,
                requestorId: currentUser.id,
                accepted: false,
            }),
        })
        const result = await response.json()
        return data({message: result.message, status: result.status, intent: "addFriend"})
    }

    if (intent === "removeFriend") {
        const response = await fetch(`${process.env.REST_API_URL}/friend`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie,
                Authorization: authorization,
            },
            body: JSON.stringify({requestorId: params.userId}),
        })
        const result = await response.json()
        return data({message: result.message, status: result.status, intent: "removeFriend"})
    }

    return null
}

// ── Card backgrounds ──────────────────────────────────────────
const CARD_BG = [
    "bg-green-50",
    "bg-amber-50",
    "bg-blue-50",
    "bg-pink-50",
    "bg-purple-50",
    "bg-teal-50",
]

// ── Avatar helpers ────────────────────────────────────────────
const AVATAR_COLORS = [
    "bg-green-100 text-green-700",
    "bg-blue-100 text-blue-700",
    "bg-orange-100 text-orange-700",
    "bg-pink-100 text-pink-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-teal-100 text-teal-700",
]
function avatarColor(id: string) {
    const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
function initials(username: string) {
    return username.slice(0, 2).toUpperCase()
}

export default function FriendProfile() {
    const {friend, currentUser, friendStatus: initialStatus, recipes, reviews, mutualFriends} = useLoaderData<typeof loader>()
    const actionData = useActionData<typeof action>()
    const [activeTab, setActiveTab] = useState<"recipes" | "mutual">("recipes")
    const [avatarError, setAvatarError] = useState(false)

    // Optimistic status update after action
    let friendStatus: FriendStatus = initialStatus
    if (actionData && "intent" in actionData && actionData.status === 200) {
        if (actionData.intent === "addFriend") friendStatus = "pending"
        if (actionData.intent === "removeFriend") friendStatus = "none"
    }

    const joinedDate = friend.createdAt
        ? new Date(friend.createdAt).toLocaleDateString(undefined, {month: "long", year: "numeric"})
        : null
    const joinedYear = friend.createdAt
        ? new Date(friend.createdAt).getFullYear()
        : "—"

    const tabs = [
        {key: "recipes", label: "Recipes"},
        {key: "mutual", label: "Mutual friends"},
    ] as const

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">

            {/* ── Back button ── */}
            <Link
                to="/allfriends"
                onClick={e => {e.preventDefault(); history.back()}}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors mb-8"
            >
                ← Back
            </Link>

            {/* ── Profile header ── */}
            <div className="flex flex-col sm:flex-row gap-6">
                {/* Avatar */}
                <div className="shrink-0">
                    {avatarError ? (
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center font-bold text-xl ${avatarColor(friend.id)}`}>
                            {initials(friend.username)}
                        </div>
                    ) : (
                        <img
                            src={`/api/avatar/${friend.id}`}
                            alt={friend.username}
                            className="w-20 h-20 rounded-full object-cover"
                            onError={() => setAvatarError(true)}
                        />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{friend.username}</h1>
                            <p className="text-sm text-gray-400 mt-0.5">
                                @{friend.username.toLowerCase().replace(/\s+/g, "")}
                                {joinedDate && <> · Member since {joinedDate}</>}
                            </p>
                            {friend.bio && (
                                <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-md">{friend.bio}</p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-3">
                                <span className="px-3 py-1 rounded-full border border-gray-300 text-xs text-gray-600">
                                    Home cook
                                </span>
                            </div>
                        </div>

                        {/* Action buttons */}
                        {friendStatus !== "self" && (
                            <div className="flex gap-2 shrink-0 flex-col items-start sm:items-end">
                                {friendStatus === "friends" && (
                                    <Form method="post">
                                        <input type="hidden" name="intent" value="removeFriend" />
                                        <button
                                            type="submit"
                                            className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            ✓ Friends
                                        </button>
                                    </Form>
                                )}
                                {friendStatus === "pending" && (
                                    <button
                                        type="button"
                                        disabled
                                        className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 cursor-default"
                                    >
                                        Request sent
                                    </button>
                                )}
                                {friendStatus === "none" && (
                                    <Form method="post">
                                        <input type="hidden" name="intent" value="addFriend" />
                                        <button
                                            type="submit"
                                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            + Add friend
                                        </button>
                                    </Form>
                                )}
                                {actionData && "message" in actionData && actionData.message && (
                                    <p className={`text-xs ${actionData.status === 200 ? "text-green-600" : "text-red-500"}`}>
                                        {actionData.message}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
                {[
                    {label: "Meals cooked", value: recipes.length},
                    {label: "Recipes saved", value: recipes.length},
                    {label: "Mutual friends", value: mutualFriends.length},
                    {label: "Member since", value: joinedYear},
                ].map(stat => (
                    <div key={stat.label} className="border border-gray-200 rounded-xl px-4 py-4 bg-white text-center">
                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Tab bar ── */}
            <div className="flex gap-2 mt-8 border-b border-gray-200 pb-0">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={[
                            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                            activeTab === tab.key
                                ? "border-gray-900 text-gray-900"
                                : "border-transparent text-gray-400 hover:text-gray-600",
                        ].join(" ")}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Tab content ── */}
            <div className="mt-8">
                {activeTab === "recipes" && (
                    recipes.length === 0 ? (
                        <p className="text-sm text-center text-gray-400 py-12">No recipes saved yet.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {recipes.map((recipe, i) => {
                                const bg = CARD_BG[i % CARD_BG.length]
                                const reviewList: any[] = reviews[recipe.id] ?? []
                                const avgRating = reviewList.length
                                    ? (reviewList.reduce((s: number, r: any) => s + r.rating, 0) / reviewList.length).toFixed(1)
                                    : null
                                const ingredientNames = recipe.ingredients.slice(0, 4).map((ing: any) => ing.name).join(", ")

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
                                                <Link
                                                    to={`/recipe/${recipe.id}`}
                                                    className="text-xs font-medium text-amber-500 hover:text-amber-600 transition-colors"
                                                >
                                                    View recipe →
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )
                )}
                {activeTab === "mutual" && (
                    mutualFriends.length === 0 ? (
                        <p className="text-sm text-center text-gray-400 py-12">No mutual friends yet.</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {mutualFriends.map(mutualFriend => (
                                <Link
                                    key={mutualFriend.id}
                                    to={`/friendprofile/${mutualFriend.id}`}
                                    className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
                                >
                                    <div className="relative w-12 h-12">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${avatarColor(mutualFriend.id)}`}>
                                            {initials(mutualFriend.username)}
                                        </div>
                                        <img
                                            src={`/api/avatar/${mutualFriend.id}`}
                                            alt={mutualFriend.username}
                                            className="absolute inset-0 w-12 h-12 rounded-full object-cover"
                                            onError={(imgEvent) => { imgEvent.currentTarget.style.display = 'none' }}
                                        />
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 text-center">{mutualFriend.username}</p>
                                </Link>
                            ))}
                        </div>
                    )
                )}
            </div>

        </div>
    )
}
