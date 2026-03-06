import {type RouteConfig, index, route, layout} from "@react-router/dev/routes";

export default [
    layout('layouts/main.tsx', [
    index("routes/home/home.tsx"),
    route("/recipe", "routes/recipe/recipe.tsx"),
    route('/meals','routes/meals/meals.tsx'),
    route('/login', 'routes/login-newaccount/login.tsx'),
    route('/friends', 'routes/friends/friends.tsx'),
    route('/accountset', 'routes/account/accountset.tsx'),
    route('/items-list', 'routes/items-list-page/items-list.tsx'),
    route("/allfriends", "routes/friends/allfriends.tsx"),
    route('/saved-recipes', 'routes/recipe/saved-recipes.tsx'),

    ])
] satisfies RouteConfig

