import { lightning } from './lightning'
import './style.css'

const createLightningElement = () => {
  const electroStream: NodeListOf<HTMLElement> =
    document.querySelectorAll('.lighting-element')

  for (const element of electroStream) {
    element.addEventListener('click', function (e: MouseEvent) {
      lightning(element, e.clientX, e.clientY)
    })
  }
}

createLightningElement()

export default createLightningElement
