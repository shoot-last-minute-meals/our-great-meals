import {
    fileStorage,
    getStorageKey,
} from "../../utils/image-storage.server";
import type { Route } from "./+types/image";

export async function loader({ params }: Route.LoaderArgs) {
    const storageKey = getStorageKey(params.id);
    const file = await fileStorage.get(storageKey);

    if (!file) {
        throw new Response("Fridge image not found", {
            status: 404,
        });
    }

    return new Response(file.stream(), {
        headers: {
            "Content-Type": file.type,
            "Cache-Control": "no-cache",
        },
    });
}