# Synqui landing page

The page is the Notio template from [StyleUI](https://github.com/heyfabrika/styleui) (MIT, see `STYLEUI-LICENSE`), copied from commit `3da5706` with its layout, type, spacing, radii, shadows and motion left as its authors made them. Only the copy, the imagery, the logo and the accent colour are Synqui's.

```bash
npm install
npm run build     # static export to out/
npm run preview   # serves out/ on port 4173
```

The waitlist form has no backend. It opens the visitor's mail app with a prefilled message to the address in `components/templates/notio/waitlist-form.tsx`.
