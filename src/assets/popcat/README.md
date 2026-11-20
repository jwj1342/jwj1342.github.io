# Pop Cat's picture

Put the cat's picture here and it replaces the drawn cat on the chat button:

- `closed.png` — the cat with its mouth shut (shown normally)
- `open.png` — the cat with its mouth open (shown on hover, on click, and while the model is writing)

`.png`, `.webp`, `.jpg`, `.gif` and `.avif` all work; a transparent background looks best.
With only `closed.*` present the cat gives a small bounce instead of opening its mouth.
With neither, the site falls back to the drawn cat in `src/components/PopCat.astro`.

Only use a picture you are allowed to publish.

The current `closed.png` and `open.png` are the two 128 px Popcat icons from
https://github.com/Afool4U/Popcat_Recycle_bin (`cat_full` and `cat_empty`), converted
from .ico to .png. The Popcat picture itself is of the cat Oatmeal and belongs to its owner.
