const sky = `       .            *              .
  *          .--.         .         *
            (    )    .         .
   .         '--'           *
     ___              ___
  .-'   '-.        .-'   '-.
 :         :      :         :
  '-.   .-'        '-.   .-'`

const water = `~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~`

const shore = `   |||       |||        |||
  |||||     |||||      |||||
__|||||_____|||||______|||||__`

export function AsciiCoast() {
  return (
    <div className="coast" aria-hidden="true">
      <pre className="coast-sky">{sky}</pre>
      <pre className="coast-water">{water}</pre>
      <pre className="coast-shore">{shore}</pre>
    </div>
  )
}
