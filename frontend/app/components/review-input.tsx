"use client";

import { Label, Textarea, Button, Rating, RatingStar } from "flowbite-react";
import React, { useState } from "react";

export function ReviewBoxComponent() {
    const [rating, setRating] = useState(0);

    const handleRatingClick = (value: React.SetStateAction<number>) => {
        setRating(value);
    };

    return (
        <form className="max-w-md">
            <div className="mb-4">
                <div className="mb-2 block">
                    <Label htmlFor="comment" value="Your review message" />
                </div>
                <Textarea
                    id="comment"
                    placeholder="Leave a review..."
                    required
                    rows={4}
                />
            </div>
            <div className="mb-4 flex items-center">
                <Label htmlFor="rating" value="Your rating:" className="mr-3" />
                <Rating>
                    {[1, 2, 3, 4, 5].map((starIndex) => (
                        <RatingStar
                            key={starIndex}
                            filled={starIndex <= rating}
                            onClick={() => handleRatingClick(starIndex)}
                            className="cursor-pointer"
                        />
                    ))}
                </Rating>
                {rating > 0 && <span className="ml-2 text-sm font-medium text-gray-500 dark:text-gray-400">
          {rating} out of 5
        </span>}
            </div>
            <Button type="submit">Post review</Button>
        </form>
    );
}
