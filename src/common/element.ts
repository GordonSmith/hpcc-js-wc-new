import { Dispatch, IObserverHandle } from "@hpcc-js/util";
import { isTrue } from "../util";
import { classMeta } from "./decorator";
import { Ref } from "./html";
import { AttrChangedMessage, ChangeMap } from "./message";

export type HTMLColor = string;

export const DefaultEventOptions = {
    bubbles: true,
    composed: true,
    cancelable: true
};

export class HPCCElement extends HTMLElement {

    static get observedAttributes(): string[] {
        return classMeta(this.name).observedAttributes;
    }

    private $meta = classMeta(this.constructor.name);

    private $dispath = new Dispatch<AttrChangedMessage>();

    protected _fire = (what: string, oldVal: any = false, newVal: any = true) => {
        this.$dispath.post(new AttrChangedMessage(what, oldVal, newVal));
    };

    private $dispatchHandle: IObserverHandle;

    private $styles: HTMLStyleElement;
    protected set styles(_: string) {
        this.$styles.innerHTML = _;
    }
    protected get styles() {
        return this.$styles.innerHTML;
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot!.innerHTML = this.$meta.template?.html.trim() || "";
        for (const directive of this.$meta.template?.directives || []) {
            if (directive instanceof Ref) {
                const ref = this.shadowRoot!.getElementById(directive.id);
                this[directive.id] = ref;
                ref?.removeAttribute("id");
            }
        }
        this.$styles = document.createElement("style");
        this.$styles.innerHTML = this.$meta.styles.trim();
        this.shadowRoot!.insertBefore(this.$styles, this.shadowRoot!.firstChild);
    }

    private _initialized = false;
    private initalizeAttributes(): ChangeMap {
        if (this._initialized) return {};
        this._initialized = true;
        const retVal: ChangeMap = {};
        this.$meta.observedAttributes.forEach(attr => {
            const innerID = `_${attr}`;
            const value = this[innerID];
            if (this.hasAttribute(attr)) {
                if (typeof this[innerID] === "boolean") {
                    this[innerID] = true;
                } else {
                    this[innerID] = this.getAttribute(attr);
                }
                retVal[attr] = { oldValue: undefined, newValue: this[innerID] };
            } else {
                this.setAttribute(attr, value);
                retVal[attr] = { oldValue: undefined, newValue: value };
            }
        });
        this.$meta.observedProperties.forEach(prop => {
            retVal[prop] = { oldValue: undefined, newValue: this[prop] };
        });
        return retVal;
    }

    connectedCallback() {
        const changes = this.initalizeAttributes();
        this.enter();
        this.update(changes);
        this.$dispath.flush();
        this.$dispatchHandle = this.$dispath.attach((messages) => {
            if (this.isConnected) {
                const changes: ChangeMap = {};
                if (messages.length > 1) throw new Error("Conflation issue.");
                for (const what in messages[0].changes) {
                    const change = messages[0].changes[what];
                    if (change.oldValue !== change.newValue) {
                        changes[what] = change;
                    }
                }
                if (Object.keys(changes).length) {
                    this.update(changes);
                }
            }
        });
    }

    disconnectedCallback() {
        this.$dispatchHandle.release();
        this.exit();
    }

    adoptedCallback() {
    }

    attributeChangedCallback(name, oldValue, newValue) {
        const innerID = `_${name}`;
        if (typeof this[innerID] === "boolean") {
            newValue = isTrue(newValue);
        }
        if (this[innerID] !== newValue) {
            this[innerID] = newValue;
            this._fire(name, oldValue, newValue);
        }
    }

    //  Lifecycle  ---
    enter() {
        for (const key of this.$meta.observedAttributes) {
            if (this[key] != this.getAttribute(key)) {
                console.log("enter error", key, this[key], this.getAttribute(key));
            }
        }
    }

    update(changes: ChangeMap) {
        for (const key in changes) {
            if (this.$meta.observedAttributes.indexOf(key) >= 0 && this[key] != this.getAttribute(key)) {
                this.setAttribute(key, this[key]);
            }
        }
        for (const key of this.$meta.observedAttributes) {
            if (this.$meta.observedAttributes.indexOf(key) >= 0 && this[key] != this.getAttribute(key)) {
                console.log("update error", key, this[key], this.getAttribute(key));
            }
        }
    }

    exit() {
    }

    //  Events  ---
    $emit(type: string, detail?: any, options?) {
        const opts = { detail, ...DefaultEventOptions, ...options };
        if (this.isConnected) {
            return this.dispatchEvent(new CustomEvent(type, opts));
        }
        return opts.cancelable ? true : false;
    }
}