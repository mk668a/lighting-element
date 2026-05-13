import { lightning } from './lightning'
import './style.css'

const createLightningElement = () => {
  const electroStream: NodeListOf<HTMLElement> =
    document.querySelectorAll('.lighting-element')

  for (const element of electroStream) {
    element.addEventListener('click', function (e: MouseEvent) {
      const x = e.clientX
      const y = e.clientY

      lightning(element, x, y)

      element.style.setProperty('--before-top', `${y}px`)
      element.style.setProperty('--before-left', `${x}px`)
    })
  }
}

createLightningElement()

export default createLightningElement
